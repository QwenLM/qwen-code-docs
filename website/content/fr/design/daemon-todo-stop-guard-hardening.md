# Durcissement de la garde d'arrêt des todos du démon

## Contexte

La garde d'arrêt des todos du démon peut ajouter une continuation automatique
bornée après qu'un tour de modèle a laissé des éléments Todo fiables non
terminés. Un bridge peut admettre un autre prompt utilisateur pendant que le
tour courant est en drain, et les agents d'arrière-plan, les moniteurs, les
notifications et les tâches cron peuvent se terminer en même temps. La garde
ne doit pas dépasser un travail utilisateur admis, ranimer du travail d'un
autre workspace ou d'un autre prompt, ni perdre du contenu utilisateur et
d'outil lorsqu'un envoi automatique échoue.

## Propriété de la continuation

`craft/claimTodoStopGuardContinuation` est la frontière d'ordre entre une
file de prompts du bridge et une continuation de la garde. La requête
contient l'ID de session et, pour un prompt possédé par le bridge, le
`InvocationContextV1.promptId` fiable injecté par le bridge. Les IDs de
prompt du provider local à la session ne sont pas des propriétaires.

Pour un prompt possédé par le bridge, le démon revendique uniquement tant
que ce prompt est encore l'entrée en cours active et non abandonnée. Un
prompt en file live produit `{ claimed: false, hasQueuedPrompt: true }` et
lie l'attente à l'ID de prompt propriétaire courant. Un propriétaire absent,
remplacé ou en conflit échoue en fail closed sans modifier l'état d'un autre
propriétaire. Un tour automatique sans propriétaire ne peut revendiquer que
lorsqu'aucun prompt bridge live n'existe.

Les canaux et l'agent partagé du bureau n'ont pas le FIFO du démon. Ils
valident la session courante et renvoient une revendication réussie pour
celle-ci ; les sessions inconnues et les gestionnaires de repli sans
propriétaire échouent en fail closed. Les clients qui n'implémentent pas la
méthode, les réponses mal formées et l'échéance de revendication de deux
secondes désactivent uniquement la partie garde d'une continuation ; un hook
Stop externe bloquant de manière indépendante peut continuer. Un prompt FIFO
live confirmé termine à la place immédiatement l'ancien tour, sans afficher
ni compter la réponse du hook désormais obsolète.

`craft/todoStopGuardQueueReleased` porte l'ID de prompt propriétaire de la
garde. Une libération tardive ne peut effacer que l'attente correspondante.
La promotion FIFO efface aussi l'attente liée au propriétaire car le prompt
utilisateur en file a pris la propriété. La session suit également les
revendications en cours : si la libération correspondante est traitée avant
la continuation de la réponse de revendication, elle enregistre une pierre
tombale de courte durée, applique l'état de libération terminal et refuse
d'installer une attente depuis la réponse obsolète. La pierre tombale est
supprimée lorsque la dernière revendication en cours pour ce propriétaire se
stabilise.

## Ordre d'envoi et préservation

Le champ `hasQueuedPrompt` du résultat de drain est un indice. Un indice
positif est confirmé par une revendication : une file encore live cède le
tour, tandis qu'une file disparue permet au traitement Stop de continuer. Si
le même drain a aussi supprimé du contenu utilisateur en cours de tour, la
cession stocke ce contenu dans l'historique de chat avant que le prompt en
file ne s'exécute, afin que la frontière d'ordre ne devienne pas une
frontière de perte de données. Un drain échoué ou mal formé donne la priorité
au contenu utilisateur récupéré lorsqu'un tel contenu existe ; sinon il
suspend durement la garde sans supprimer un hook Stop externe indépendant.

Avant un flux de modèle attribué à la garde, la session draine l'entrée,
construit les parties d'image, sélectionne le modèle de vision de tour
complet, rafraîchit le mode PLAN et l'état d'arrière-plan, rafraîchit la
décision de la garde et revendique la continuation. La compression, les
vérifications de limite de tokens et l'envoi au provider n'ont lieu qu'après
cette revendication. Chaque flux de garde supplémentaire revendique
séparément. Un prompt admis avant la revendication gagne ; un prompt admis
après la revendication est ordonné après la continuation déjà validée.

Si la préparation, la compression, la revendication, la validation de limite
de tokens, la création du flux ou l'envoi au provider échoue, l'instruction
de garde non envoyée est supprimée avant la préservation de l'historique.
Les parties utilisateur drainées, les réponses de fonction réussies et les
autres contenus Stop indépendants restent. La session compare le compteur de
poussées de contenu utilisateur avant d'ajouter l'historique afin qu'une
couche inférieure qui a déjà persisté le contenu ne puisse pas provoquer de
doublon.

## Suspension dure

La suspension dure est engagée après l'épuisement de la garde, la
destruction explicite de la session, le début d'un déplacement du répertoire
de travail, une libération terminale de prompt en file, un drain non fiable
sans entrée utilisateur récupérée, et les chemins d'annulation ou d'échec
contrôlés qui ne peuvent pas continuer la chaîne en toute sécurité. Elle
efface la propriété en file existante et bloque les écritures Todo tardives
qui réarmeraient l'ancienne chaîne. Une observation FIFO complète en conflit
avec la suspension peut encore établir la priorité d'ordre de prompt pour
son propriétaire, mais cette priorité ne restaure pas la confiance de la
garde ni n'autorise un envoi de la garde.

Seul un nouveau prompt ordinaire démarre une nouvelle chaîne. Une nouvelle
tentative fiable peut reprendre une chaîne mise en pause pour nouvelle
tentative, mais les résultats d'arrière-plan, les tours cron, les tours de
notification, les rafraîchissements de paramètres et les achèvements d'outil
tardifs ne peuvent pas effacer la suspension dure. Entrer en mode PLAN
efface la confiance de la garde et empêche la continuation automatique.

## Lignée d'arrière-plan

La session capture une baseline d'arrière-plan au début de chaque chaîne de
travail et réinitialise ensemble la baseline et l'ensemble explicite d'agents
liés.

- Un agent de premier niveau nouvellement créé est lié.
- Un nouvel enfant hérite récursivement de son parent. Les parents absents
  et les cycles échouent en fail closed.
- Un agent de la baseline n'est pas lié sauf si la chaîne le continue avec
  succès via `send_message(task_id)`.
- `send_message(task_id)` marque provisoirement la cible après les
  vérifications de permission et de `PreToolUse` mais avant l'exécution,
  afin qu'une notification d'achèvement rapide soit classifiée correctement.
  Le succès est validé avant `PostToolUse` ; une erreur, une annulation ou
  une exception ne fait un rollback que de la marque introduite par cet
  appel.
- `send_message(to)` adressé à une équipe ne change pas la lignée de tâche.
- Un moniteur avec un propriétaire hérite de la relation du propriétaire
  quelle que soit sa propre appartenance à la baseline. Un moniteur sans
  propriétaire utilise son ID de moniteur.

La relation de notification est stockée au moment de la mise en file afin
que la suppression ultérieure du registre ou les changements de statut ne
puissent pas reclassifier un résultat déjà livré. Les scans live, la
sélection de priorité et la protection contre le débordement utilisent les
mêmes règles de lignée. Démarrer un nouveau prompt ordinaire réinitialise
intentionnellement à non liée toute notification déjà en file : ces
résultats ont été mis en file avant la frontière de la nouvelle chaîne de
travail et ne peuvent pas hériter de la classification de leur chaîne
précédente.

## Cycle de vie de session et files bornées

`/cd` valide et canonicalise la cible avant d'acquérir la porte de fermeture
de session existante. Un no-op apparent acquiert aussi la porte et revérifie
le répertoire courant, afin de ne pas entrer en conflit avec un déplacement
concurrent ; il ne suspend pas durement la garde sauf s'il devient un vrai
déplacement. Une fois qu'un déplacement est sous porte, il suspend durement
la garde, attend que les tours de premier plan, cron et de notification se
stabilisent, déplace, rafraîchit le contexte du modèle et libère la porte
dans `finally`. L'admission de prompt vérifie la porte à la fois avant et
après l'admission du writer. La boucle de stabilisation revérifie la
propriété après chaque achèvement afin qu'un prompt admis avant la porte en
attendant son prédécesseur soit inclus aussi. Un échec de déplacement laisse
l'ancienne garde suspendue.

`dispose()` reste synchrone mais interrompt le contrôleur de premier plan
avec une raison dédiée d'annulation contrôlée, suspend durement la garde et
empêche les résultats d'outil tardifs de la ranimer. Les chemins de
fermeture de production conservent la responsabilité d'attendre que les
tours se stabilisent.

Au chargement ou à la reprise d'une session persistée, la relecture de
l'historique, la restauration du worktree, la restauration des agents en
pause et la restauration du but se terminent tous avant que le rewriter et
le planificateur cron durable ne démarrent. Cela empêche un déclenchement
cron immédiatement dû d'entrer en conflit avec la restauration et de
classifier un agent en pause préexistant comme un nouveau travail de la
chaîne reprise.

Le débordement de cron différé est calculé après déduplication. Un élément
entrant lié peut conserver vingt éléments non liés ; un élément entrant non
lié réduit d'abord à dix-neuf puis devient le vingtième. Les entrées liées
ne sont jamais évincées, et une réduction multi-entrées émet un seul
diagnostic.

Le cas de la file de notifications où toutes les entrées bornées sont liées
reste différé. Remplacer un résultat lié unique par un autre serait encore
une perte de données silencieuse. Un design de suivi doit fournir un
résultat récupérable ou une notice de trou durable, visible par le modèle et
l'utilisateur, pour chaque résultat lié omis. Suivre ce travail dans
[#7805](https://github.com/QwenLM/qwen-code/issues/7805).
