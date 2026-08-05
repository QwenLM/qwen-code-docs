# Durcissement de la résolution des fils de review par Autofix

## Problème

Qwen Autofix permet déjà à l'agent de traitement de review d'identifier les commentaires de review inline qui sont résolus dans le code. Le workflow hôte détenteur d'identifiants mappe ces ID de commentaires REST aux fils de review GitHub et appelle `resolveReviewThread` après avoir poussé le correctif.

L'ordre actuel est généralement sûr, mais il ne prouve pas que la tête de PR live en cours de résolution est le commit exact couvert par la vérification déterministe :

- Un push rejeté peut être récupéré en fusionnant la tête distante nouvellement déplacée. Le commit fusionné est poussé alors que la vérification est antérieure à la fusion.
- L'auteur de la PR peut pousser à nouveau après le push d'Autofix et avant la mutation de résolution.
- Une réparation dans la même exécution peut hériter de `resolved-comments.txt` ou `comment-replies.json` de la première tentative rejetée.

Ces lacunes peuvent marquer une conversation comme résolue sans preuve que la tête actuelle de la PR contient toujours le correctif vérifié.

## État actuel

Les responsabilités sont déjà correctement séparées :

- `.qwen/skills/autofix/SKILL.md` indique à l'agent comment classifier les constats et écrire `resolved-comments.txt` ou `comment-replies.json`.
- `.github/scripts/run-autofix-review-verification.sh` exécute indépendamment le build, le typecheck, le lint et les tests des paquets affectés, de manière déterministe.
- `.github/workflows/qwen-autofix.yml` possède le PAT GitHub, pousse la branche, récupère les fils de review et effectue les mutations.
- `scripts/tests/qwen-autofix-workflow.test.js` extrait et exécute les blocs shell du workflow avec des réponses GitHub stubbées.

La mutation GitHub doit rester dans le workflow fiable. L'agent ne doit pas recevoir d'identifiants GitHub.

## Changements proposés

### Gate de vérification

Exiger un worktree suivi et un index propres avant les vérifications déterministes, capturer le SHA du commit, et exiger que le SHA et l'état suivi restent inchangés après les vérifications structurelles, puis à nouveau après le build, le typecheck, le lint et les tests. Enregistrer ensuite ce SHA capturé comme sortie d'étape nommée `verified_head`. Ne pas l'émettre pour les résultats no-op ou en échec. Cela rejette les changements suivis persistants ou les commits créés par des vérifications contrôlées par la branche ; cela ne prétend pas à un système de fichiers immuable ni ne détecte un script qui change temporairement l'état et le restaure au sein d'une seule commande, ce qui reste pris en charge par le modèle de confiance CI existant.

### Sélection de la vérification finale

Propager le SHA de vérification sélectionné à travers l'étape de vérification finale :

- utiliser le premier SHA de vérification lorsqu'aucune réparation n'a été exécutée ;
- utiliser uniquement le SHA de vérification de la réparation lorsque la réparation a été exécutée ;
- ne jamais retomber sur le premier SHA pour un résultat réparé réussi.

### Isolation de la réparation

Avant d'invoquer l'agent de réparation, supprimer `resolved-comments.txt` et `comment-replies.json` avec les autres artefacts de la tentative précédente. La tentative de réparation doit régénérer explicitement ses dispositions finales. Les fichiers manquants échouent donc en fail closed : aucun fil n'est résolu ni répondu.

### Preuve de résolution après push

Avant de résoudre un fil sélectionné, exiger tout ce qui suit :

1. `verified_head` est non vide.
2. La récupération de course au push n'a pas créé un commit de fusion non vérifié.
3. Le `HEAD` local après le push réussi est égal à `verified_head`.
4. Une requête `gh pr view` live réussit.
5. Le `headRefOid` de la PR live est égal à `verified_head` avant chaque mutation.
6. Le `headRefOid` de la PR live est toujours égal à `verified_head` immédiatement après chaque mutation.

Avant chaque mutation, une unique garde GraphQL lit à la fois le `headRefOid` live et l'état `isResolved` live du fil cible. Un fil déjà résolu par un autre acteur est ignoré. Après la mutation, la même garde vérifie à nouveau les deux valeurs. Cette vérification posteriori s'exécute aussi lorsque la commande de mutation renvoie une erreur, car une réponse perdue ne prouve pas que GitHub n'a pas appliqué la mutation.

Si une condition avant mutation est inconnue ou fausse, ou si une condition après mutation est ambiguë, arrêter de résoudre des conversations supplémentaires. Une mutation en échec dont la garde posteriori prouve que la tête vérifiée est inchangée et que le fil reste ouvert peut sans risque émettre un avertissement et continuer. Le workflow n'appelle pas `unresolveReviewThread` : GitHub n'expose ni précondition compare-and-swap ni attribution de mutation, de sorte que même une réponse `resolveReviewThread` réussie ne peut pas prouver qu'un autre acteur n'a pas résolu le fil entre la garde préalable et la mutation. Le rouvrir automatiquement pourrait donc annuler l'action d'un autre reviewer. Une commande de mutation infructueuse suivie d'une garde posteriori confirmant la tête vérifiée et l'état résolu est comptée comme un état résolu observé, sans l'attribuer à Autofix ; tout résultat ambigu arrête les mutations restantes.

Le push de code vérifié et le rapport de tour normal réussissent toujours. Les réponses pour les constats délibérément laissés ouverts peuvent continuer après un push réussi, car elles n'affirment pas qu'un fil est corrigé.

## Décisions de conception

- **Fail closed pour la résolution :** un fil non résolu est récupérable ; un fil résolu à tort peut masquer un vrai défaut.
- **Ignorer la résolution après une fusion de course :** réexécuter la gate déterministe complète dans l'étape de publication détentrice du PAT dupliquerait une logique coûteuse et exécuterait des scripts contrôlés par la branche avec des identifiants dans le périmètre. Un tour de review ultérieur peut résoudre le fil en toute sécurité.
- **Interroger l'état live de la PR immédiatement avant la mutation :** la concurrence des workflows ne peut pas empêcher les push directs des contributeurs.
- **Conserver le contrat de disposition du modèle existant :** le jugement sémantique reste chez l'agent, tandis que l'identité exacte du commit est appliquée de manière déterministe par l'hôte.
- **Ne pas ajouter de code CLI/core général :** il s'agit d'orchestration du workflow Autofix, pas d'une fonctionnalité réutilisable du runtime de Qwen Code.

## Fichiers affectés

- `.github/scripts/run-autofix-review-verification.sh`
- `.github/workflows/qwen-autofix.yml`
- `scripts/tests/qwen-autofix-workflow.test.js`
- `.qwen/skills/autofix/SKILL.md` pour la clarification du contrat

## Limites du périmètre

Inclus :

- l'égalité exacte tête vérifiée/live ;
- le comportement fail closed en cas de course au push ;
- l'isolation des dispositions des tentatives de réparation ;
- des tests ciblés de contrat et de comportement du workflow.

Exclus :

- la pagination GraphQL au-delà des 100 premiers fils existants ;
- la résolution de conversations de PR arbitraires hors Autofix ;
- le rejet des reviews `CHANGES_REQUESTED` ;
- donner au modèle des identifiants GitHub directs ;
- modifier `/review` générique ou le comportement du CLI.

## Questions ouvertes

Aucune. Le comportement conservateur est déterministe avant la mutation : l'incertitude empêche des fils supplémentaires d'être résolus. Après une mutation, le workflow observe et rapporte l'état mais ne le dé-résout jamais automatiquement sans preuve de propriété atomique.
