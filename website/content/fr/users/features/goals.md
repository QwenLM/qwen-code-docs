# Goals

Un Goal maintient Qwen Code en activité à travers les tours jusqu'à ce qu'une condition déclarée soit remplie. Définissez-en un avec `/goal <objective>`, et la session continue d'elle-même. Chaque tour est enregistré comme preuve ; lorsque le modèle propose que l'objectif est terminé ou bloqué, un vérificateur indépendant juge cette proposition à partir des preuves uniquement. La session s'arrête lorsque le vérificateur accepte, ou lorsque le Goal est mis en pause, effacé ou arrêté par une limite.

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

Une fois qu'un Goal a facturé un tour, la pilule de pied de page et chaque carte de statut affichent ce qu'il a dépensé par rapport à la fenêtre autorisée, sous la forme `1.2k/30.0m`. Le chiffre compte les appels de modèle que le Goal fait dans ses propres tours ; les sous-agents et les vérifications du vérificateur ne sont pas inclus. La fenêtre est définie par [`model.goalTokenBudget`](../configuration/settings.md) ; reprendre un Goal qui a épuisé sa fenêtre en accorde une nouvelle en plus de ce qu'il a déjà dépensé, donc le chiffre affiche `30.0m/60.0m` au lieu de recommencer à zéro. Un Goal sans budget affiche uniquement ce qu'il a dépensé. Un Goal qui n'a pas encore facturé de tour n'affiche aucun chiffre.

Chaque tour que la session entreprend d'elle-même signale ce que le Goal a dépensé jusqu'à présent, combien de tours le soutiennent, et — sauf si le Goal s'exécute sans limite — la fenêtre qui lui est autorisée. Chacun de ces tours, sauf la transmission finale de clôture, porte également des instructions permanentes pour revérifier le workspace plutôt que faire confiance aux rapports des tours précédents, pour travailler vers l'état final demandé par l'objectif, pour faire autrement lorsque le tour précédent n'a rien changé (à partir du deuxième tour, dès qu'il y a un tour précédent à juger), et pour vérifier chaque exigence par rapport à des preuves citables avant de proposer que le Goal est terminé.

Un Goal long comprime périodiquement les preuves qu'il a enregistrées en revendications de checkpoint avec un appel à un modèle secondaire, afin que les tours ultérieurs et le vérificateur puissent encore les citer. Cet appel est borné par [`model.goalCheckpointTimeoutSeconds`](../configuration/settings.md), 180 secondes par défaut ; un checkpoint qui ne se termine pas à temps est abandonné comme un test non concluant — la série de blocages de checkpoint est préservée plutôt qu'incrémentée — et un tour ultérieur réessaie. L'appel est diffusé en flux, donc le timeout de transport par requête ne borne que la connexion et la première réponse, et le plafond lui-même s'arrête à la limite de durée de vie de 15 minutes des gardes du flux parce qu'au-delà, c'est le garde, et non le paramètre, qui termine l'appel. Cette limite de 15 minutes sur le paramètre est fixe, et augmenter le propre plafond du garde du flux ne la lève pas.

## Interrompre un Goal

Annuler un tour de Goal met le Goal en pause. Appuyez sur Échap pendant que le modèle répond ou pendant que ses outils sont encore en cours d'exécution, et le tour s'arrête, le Goal passe à `paused`, et la carte et `/goal` indiquent tous deux pourquoi il s'est arrêté. Rien ne continue tant que vous n'avez pas exécuté `/goal resume`.

Taper un message pendant qu'un Goal est actif ne le met pas en pause. Votre message s'exécute comme le prochain tour du Goal, utilisez-le donc pour orienter le travail ; utilisez `/goal pause` ou `/goal clear` pour l'arrêter.

Chaque pause indique sa raison : vous l'avez interrompu, vous avez exécuté `/goal pause`, la limite de tokens de la session a bloqué la prochaine requête modèle, que le tour a échoué, ou que trois tours d'affilée n'ont rien enregistré que le vérificateur puisse juger et aucune proposition — les opérations de comptabilité du Goal (`get_goal`, `update_goal`) ne comptent pas comme de la progression. Un Goal arrêté par une limite conserve la raison de cette limite à la place.

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

Limitez-vous à un seul objectif. `/goal set` et `/goal edit` acceptent n'importe quelle longueur, mais restez environ en dessous de 1 200 caractères : l'objectif est renvoyé à chaque tour du Goal. Un objectif que le modèle propose via `propose_goal` est limité à 1 500 caractères. Les deux commandes fusionnent les sauts de ligne en espaces, numérotez donc les éléments plutôt que de compter sur les retours à la ligne.

`Budget` est une instruction au modèle sur le moment d'arrêter et de signaler un bloqueur. Écrire un nombre de tours ou une limite de temps dans l'objectif ne configure pas un timer d'exécution ni ne modifie le budget de tokens du Goal.

| Faible                     | Pourquoi ça échoue                                        | Plus solide                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| make checkout faster       | Pas de seuil, pas de vérification.                        | `Outcome: checkout p95 is below 250 ms. Done when: 1) npm run bench:checkout exits 0 and prints p95 < 250 (paste the line); 2) npm test exits 0. Must not: change the benchmark or skip tests. Budget: stop as blocked after 20 turns.` |
| clean up the auth module   | « Clean » n'a pas de preuve.                              | Demandez ce qui serait observable : zéro warning lint dans `src/auth`, un seuil de couverture, un nombre de fichiers.                                                                                                                     |
| ship the release           | Irréversible, et nécessite une décision humaine.          | Restreignez à un état pré-release vérifiable (le tag existe, `npm run release:dry-run` sort avec 0) et mettez « do not publish » dans `Must not`.                                                                                        |
| after I confirm the design | Le vérificateur ne peut pas voir une confirmation qui n'a jamais eu lieu. | Déplacez-le dans `On block:` comme la décision qu'un humain doit prendre.                                                                                                                                                                |

## Laissez `/goal-draft` le rédiger

`/goal-draft <ce que vous voulez faire>` est un skill intégré qui fait ce qui précède pour vous. Il ne lit que ce qu'il faut du workspace pour établir le périmètre et les vraies commandes de vérification, sans exécuter de tests, sans construire, sans installer de dépendances ni démarrer de services. Il pose au maximum un tour de questions lorsque des choix essentiels ne sont pas clairs, puis rédige un objectif compact, généralement avec 3 à 5 vérifications de complétion (moins lorsque c'est suffisant). Les exigences explicites sont préservées ; il n'ajoute pas de vérifications juste pour atteindre un compte.

Pour un audit, la complétion signifie couvrir les scénarios convenus et rapporter les preuves, y compris les étapes de reproduction pour les défauts confirmés. Ne trouver aucun défaut est un résultat valide. Le draft ne doit pas inventer un nombre minimum de scénarios, de fichiers de preuve, de tours d'exploration ou de défauts.

Si un critère de succès, une commande, un chemin d'entrée ou une décision essentielle ne peut pas être établi, le skill retourne un draft marqué « Needs clarification » avec des éléments `<TODO: …>`. Il ne propose pas ce draft pour approbation ni n'affiche de commande `/goal set` ou `/goal edit` exécutable. Les valeurs par défaut non essentielles sont marquées `[ASSUMPTION]` ; elles ne se substituent pas à des critères de succès manquants.

Une fois l'objectif prêt, une session terminal interactive peut afficher la boîte de dialogue d'approbation `propose_goal` décrite ci-dessous. Web Shell et les autres clients ACP, les exécutions headless, les sessions avec l'outil désactivé et les sessions avec un Goal actif reçoivent plutôt une commande à exécuter manuellement. La transmission indique que le draft n'a pas été appliqué. Le skill ne démarre jamais le travail lui-même, et rien n'est défini sans votre approbation.

Passez un objectif existant pour le renforcer : `/goal-draft all tests pass and the lint is clean`. Pour un Goal actif, une demande explicite de le renforcer produit `/goal edit` ; un remplacement utilise `/goal set`. Si l'opération souhaitée n'est pas claire, le skill inclut ce choix dans son unique tour de questions.

### Approuver un Goal proposé par le modèle

Dans une session terminal interactive, le modèle dispose d'un outil `propose_goal`. Lorsque `/goal-draft` se termine, ou lorsque vous demandez un résultat qui s'étend sur plusieurs tours, il peut proposer l'objectif au lieu d'afficher une ligne `/goal set …` à copier. La proposition apparaît sous forme d'une boîte de dialogue d'approbation affichant l'objectif complet. L'approuver définit le Goal exactement comme le ferait `/goal set`, au moment où le tour en cours se termine (le modèle acquiesce et s'arrête ; le premier tour du Goal démarre alors de lui-même), et la refuser ne définit rien — le modèle voit uniquement que l'appel d'outil n'a pas été autorisé, et ses instructions lui disent de ne pas demander pourquoi et de ne pas proposer le même objectif à nouveau. L'approbation est liée au tour qui l'a demandée : si ce tour est annulé ou n'atteint jamais sa fin, l'approbation est abandonnée plutôt qu'appliquée sous un message ultérieur ou un tour automatisé. Aucune règle de permission ni mode d'approbation (y compris YOLO) ne contourne cette boîte de dialogue, et l'outil refuse lorsqu'un autre Goal est actif, en mode plan et dans les dossiers non fiables ; les sous-agents ne se le voient jamais proposer. Il n'est pas disponible dans les exécutions headless, ni encore dans Web Shell ou les autres sessions pilotées par ACP (elles ne traversent pas la limite de tour qui applique l'approbation) ; la ligne `/goal set` affichée reste alors le mécanisme de transmission.

Désactivez-le avec `goals.modelProposed: "disabled"` dans vos paramètres utilisateur. Parce que ce paramètre décide si le modèle peut vous demander de démarrer une boucle autonome, il est honoré uniquement depuis les portées utilisateur et système ; une valeur dans un `.qwen/settings.json` de workspace est ignorée avec un avertissement.

Le skill est configuré pour être en lecture seule, et seuls ses outils non mutatifs sont auto-approuvés (`get_goal`, `read_file`, `glob`, `grep_search`). `ask_user_question` n'est volontairement pas auto-approuvé, donc sa boîte de dialogue de questions est affichée avant que le skill ne rédige à partir de vos réponses. Comme les autres skills intégrés, un skill de projet ou personnel nommé `goal-draft` le remplace, et `skills.disabled` peut le désactiver. Consultez [Skills](./skills.md) pour savoir comment les skills intégrés sont découverts.
