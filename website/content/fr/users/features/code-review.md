# Revue de code

> Évaluez les modifications de code pour la correction, la sécurité, les performances et la qualité du code en utilisant `/review`.

## Démarrage rapide

```bash
# Revoir les modifications locales non commitées
/review

# Revoir une pull request (par numéro ou URL)
/review 123
/review https://github.com/org/repo/pull/123

# Revoir et publier des commentaires inline sur la PR
/review 123 --comment

# Revoir un fichier spécifique
/review src/utils/auth.ts
```

S'il n'y a pas de modifications non commitées, `/review` vous en informera et s'arrêtera — aucun agent n'est lancé.

## Fonctionnement

La commande `/review` exécute un pipeline en plusieurs étapes :

```
Étape 1 : Déterminer la portée (diff local / worktree PR / fichier)
Étape 2 : Charger les règles de revue du projet
Étape 3 : 10 agents de revue en parallèle                         [10 appels LLM]
           |-- Agent 0 : Fidélité aux issues et responsabilité de la cause racine
           |-- Agent 1 : Correction
           |-- Agent 2 : Sécurité
           |-- Agent 3 : Qualité du code
           |-- Agent 4 : Performances et efficacité
           |-- Agent 5 : Couverture des tests
           |-- Agent 6 : Audit non dirigé (3 personas : 6a/6b/6c)
           '-- Agent 7 : Build et tests (exécute des commandes shell)
Étape 4 : Dédupliquer --> Vérification par lot --> Agréger         [1 appel LLM]
Étape 5 : Audit inverse itératif (1 à 3 tours, recherche de lacunes) [1 à 3 appels LLM]
Étape 6 : Présenter les résultats + verdict
Étape 7 : Soumettre la revue de la PR (commentaires inline, si demandé)
Étape 8 : Sauvegarder le rapport + cache incrémental
Étape 9 : Nettoyage (suppression du worktree + fichiers temporaires)
```

### Agents de revue

| Agent                             | Focus                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 0 : Fidélité aux issues     | Preuves des issues liées, responsabilité de la cause racine, et vérification que la PR résout le problème signalé |
| Agent 1 : Correction              | Erreurs de logique, cas limites, gestion des null, conditions de course, sécurité des types |
| Agent 2 : Sécurité                | Injections, XSS, SSRF, contournement d'authentification, exposition de données sensibles    |
| Agent 3 : Qualité du code         | Cohérence du style, nommage, duplication, code mort                                         |
| Agent 4 : Performances et efficacité | Requêtes N+1, fuites de mémoire, re-rendus inutiles, taille du bundle                    |
| Agent 5 : Couverture des tests    | Chemins de code non testés dans le diff, couverture de branches manquante, assertions faibles |
| Agent 6 : Audit non dirigé        | 3 personas en parallèle (attaquant / oncall de 3h du matin / mainteneur) — détecte les problèmes inter-dimensionnels |
| Agent 7 : Build et tests          | Exécute les commandes de build et de test, signale les échecs                               |

Tous les agents s'exécutent en parallèle (l'agent 6 lance 3 variantes de personas simultanément, totalisant 10 tâches parallèles pour les revues de PR dans le même repo ; l'agent 0 est ignoré pour les revues de diff local et de chemin de fichier, qui en exécutent 9). Les résultats des agents 0 à 6 sont vérifiés en **une seule passe de vérification par lot** (un agent examine tous les résultats en même temps, ce qui maintient le coût de vérification fixe quel que soit le nombre de résultats). Après vérification, un **audit inverse itératif** exécute 1 à 3 tours de recherche de lacunes — chaque tour reçoit la liste cumulative des résultats des tours précédents, de sorte que les tours successifs se concentrent sur ce qui reste à découvrir. La boucle s'arrête dès qu'un tour retourne "Aucun problème trouvé", ou après 3 tours (limite stricte). Les résultats de l'audit inverse sautent la vérification (l'agent a déjà le contexte complet) et sont inclus en tant que résultats à haute confiance.

## Niveaux de sévérité

| Sévérité         | Signification                                                       | Publié en commentaire de PR ? |
| ---------------- | ------------------------------------------------------------------- | ----------------------------- |
| **Critique**     | Doit être corrigé avant le merge (bugs, sécurité, perte de données, échecs de build) | Oui (haute confiance uniquement) |
| **Suggestion**   | Amélioration recommandée                                            | Oui (haute confiance uniquement) |
| **Nice to have** | Optimisation optionnelle                                            | Non (terminal uniquement)     |

Les résultats à faible confiance apparaissent dans une section distincte "Needs Human Review" dans le terminal et ne sont jamais publiés en tant que commentaires de PR.

## Isolation du worktree

Lors de la revue d'une PR, `/review` crée un worktree git temporaire (`.qwen/tmp/review-pr-<number>`) au lieu de changer votre branche actuelle. Cela signifie que :

- Votre working tree, les modifications indexées et votre branche actuelle ne sont **jamais modifiés**
- Les dépendances sont installées dans le worktree (`npm ci`, etc.) pour que le build et les tests fonctionnent
- Les commandes de build et de test s'exécutent en isolation sans polluer votre cache de build local
- Si quelque chose tourne mal, votre environnement n'est pas affecté — supprimez simplement le worktree
- Le worktree est automatiquement nettoyé après la fin de la revue
- Si une revue est interrompue (Ctrl+C, crash), la prochaine `/review` de la même PR nettoie automatiquement le worktree obsolète avant de recommencer à zéro
- Les rapports de revue et le cache sont sauvegardés dans le répertoire principal du projet (pas dans le worktree)

## Revue de PR inter-repos

Vous pouvez revoir les PR d'autres dépôts en passant l'URL complète :

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Cela s'exécute en **mode léger** — pas de worktree, pas de build/test. La revue est basée uniquement sur le texte du diff (récupéré via l'API GitHub). Les commentaires de PR peuvent toujours être publiés si vous avez un accès en écriture.

| Capacité                                                 | Même repo | Inter-repos                   |
| -------------------------------------------------------- | --------- | ----------------------------- |
| Revue LLM (Agents 0-6 + vérification + audit inverse itératif) | ✅        | ✅                            |
| Agent 7 : Build et tests                                 | ✅        | ❌ (pas de base de code locale) |
| Analyse d'impact inter-fichiers                          | ✅        | ❌                            |
| Commentaires inline de la PR                             | ✅        | ✅ (si vous avez un accès en écriture) |
| Cache de revue incrémental                               | ✅        | ❌                            |

## Commentaires inline de la PR

Utilisez `--comment` pour publier les résultats directement sur la PR :

```bash
/review 123 --comment
```

Ou, après avoir exécuté `/review 123`, tapez `post comments` pour publier les résultats sans relancer la revue.

**Ce qui est publié :**

- Les résultats Critique et Suggestion à haute confiance en tant que commentaires inline sur des lignes spécifiques
- Pour les verdicts Approve/Request changes : un résumé de la revue avec le verdict
- Pour le verdict Comment avec tous les commentaires inline publiés : pas de résumé séparé (les commentaires inline sont suffisants)
- Pied de page d'attribution du modèle sur chaque commentaire (par ex., _— qwen3-coder via Qwen Code /review_)

**Ce qui reste uniquement dans le terminal :**

- Résultats Nice to have
- Résultats à faible confiance

**PR auto-rédigées :** GitHub ne vous permet pas de soumettre des revues `APPROVE` ou `REQUEST_CHANGES` sur votre propre pull request — les deux échouent avec une HTTP 422. Lorsque `/review` détecte que l'auteur de la PR correspond à l'utilisateur actuellement authentifié, il rétrograde automatiquement l'événement API en `COMMENT` quel que soit le verdict, afin que la soumission réussisse tout de même. Le terminal affiche toujours le verdict honnête ("Approve" / "Request changes" / "Comment") — seul l'événement de revue côté GitHub est neutralisé. Les résultats réels apparaissent toujours sous forme de commentaires inline sur des lignes spécifiques, les retours substantiels restent donc inchangés.

**Re-revue d'une PR avec des commentaires Qwen Code précédents :** lorsque `/review` s'exécute sur une PR qui possède déjà des commentaires de revue Qwen Code précédents, il les classe avant de publier les nouveaux. Seul le **chevauchement sur la même ligne** (un commentaire existant sur le même `(path, line)` qu'un nouveau résultat) vous invite à confirmer — c'est le cas où vous verriez un doublon visuel sur la même ligne de code. Les commentaires des commits plus anciens, les commentaires ayant reçu une réponse (considérés comme résolus), et les commentaires qui ne chevauchent simplement aucun nouveau résultat sont ignorés silencieusement, avec une ligne de log dans le terminal pour que vous sachiez ce qui a été filtré.

**Vérification du statut CI / build avant APPROVE :** si le verdict est "Approve", `/review` interroge les check-runs et les statuts de commit de la PR avant de soumettre. Si une vérification a échoué (ou si toutes les vérifications sont encore en attente), l'événement API est automatiquement rétrogradé de `APPROVE` à `COMMENT`, le corps de la revue expliquant pourquoi. Raison : la revue LLM lit le code de manière statique et ne peut pas voir les échecs de tests à l'exécution ; approuver alors que la CI est au rouge serait trompeur. Les résultats inline sont toujours publiés sans modification. Si vous souhaitez approuver quand même (par ex., un échec CI connu pour être instable), soumettez l'approbation GitHub manuellement après vérification.

## Actions de suivi

Après la revue, des astuces contextuelles apparaissent sous forme de texte fantôme. Appuyez sur Tab pour accepter :

| État après la revue                  | Astuce             | Ce qui se passe                           |
| ------------------------------------ | ------------------ | ----------------------------------------- |
| Revue locale avec des résultats non corrigés | `fix these issues` | Le LLM corrige interactivement chaque résultat |
| Revue de PR avec des résultats       | `post comments`    | Publie les commentaires inline de la PR (pas de re-revue) |
| Revue de PR, zéro résultat           | `post comments`    | Approuve la PR sur GitHub (LGTM)          |
| Revue locale, tout est clair         | `commit`           | Commit vos modifications                  |

Remarque : `fix these issues` n'est disponible que pour les revues locales. Pour les revues de PR, le worktree est nettoyé après la revue, il n'est donc pas possible de corriger interactivement après la revue — utilisez `--comment` ou `post comments` pour publier les résultats à la place.

## Règles de revue du projet

Vous pouvez personnaliser les critères de revue par projet. `/review` lit les règles depuis ces fichiers (dans l'ordre) :

1. `.qwen/review-rules.md` (natif Qwen Code)
2. `.github/copilot-instructions.md` (préféré) ou `copilot-instructions.md` (fallback — un seul est chargé, pas les deux)
3. `AGENTS.md` — section `## Code Review`
4. `QWEN.md` — section `## Code Review`

Les règles sont injectées dans les agents de revue LLM (0-6) en tant que critères supplémentaires. Pour les revues de PR, les règles sont lues depuis la **branche de base** pour empêcher une PR malveillante d'injecter des règles de contournement.

## Fidélité aux issues

Pour les PR de correction de bugs, l'agent de fidélité aux issues récupère les preuves de l'issue directement au lieu de s'appuyer sur le texte de description de la PR. Il utilise `gh pr view <pr> --repo <owner/repo> --json closingIssuesReferences` pour les métadonnées solides de GitHub concernant les issues de clôture, puis `gh issue view <number> --repo <issue_owner>/<issue_repo> --json title,body,comments` pour le rapport original et la discussion — la forme `--json` inclut le **corps** de l'issue (la reproduction originale du rapporteur), ce que `--comments` seul omet, et le propre dépôt de l'issue est lu depuis chaque référence (une PR peut fermer une issue dans un dépôt différent). Cet agent s'exécute uniquement pour les cibles de PR ; les revues de diff local et de chemin de fichier l'ignorent.

`closingIssuesReferences` est un indice de découverte plutôt qu'une preuve que l'auteur a lié la bonne issue : s'il est vide mais que la PR référence une issue cible apparente, l'agent la récupère tout de même après avoir jugé de sa pertinence. Le texte de l'issue récupéré est traité comme des données non fiables (les faits sont extraits, les instructions intégrées ignorées). Pour les issues pertinentes, la reproduction originale, le payload observé, le comportement attendu et les commentaires du mainteneur sont traités comme les preuves de plus haute priorité pour déterminer si la PR résout le bon problème.

Si les preuves de l'issue montrent qu'un service ou un fournisseur en amont a renvoyé des données malformées en dehors du contrat client, les modifications du parseur ou du sanitizeur côté client ne sont pas traitées comme une correction valide de la cause racine, à moins qu'un mainteneur n'ait explicitement demandé un contournement défensif. Un test qui rejoue une sortie amont malformée prouve seulement que le contournement gère cette forme ; il ne prouve pas que le contournement est architecturalement approprié.

Exemple de `.qwen/review-rules.md` :

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```
## Revue incrémentale

Lors de la revue d'une PR déjà examinée, `/review` analyse uniquement les modifications apportées depuis la dernière revue :

```bash
# Première revue — revue complète, cache créé
/review 123

# PR mise à jour avec de nouveaux commits — seules les nouvelles modifications sont revues
/review 123
```

### Revue multi-modèles

Si vous changez de modèle (via `/model`) et revoyez la même PR, `/review` détecte le changement de modèle et effectue une revue complète au lieu de l'ignorer :

```bash
# Revue avec le modèle A
/review 123

# Changement de modèle
/model

# Nouvelle revue — revue complète avec le modèle B (non ignorée)
/review 123
# → "La revue précédente a utilisé qwen3-coder. Exécution d'une revue complète avec gpt-4o pour un second avis."
```

Le cache est stocké dans `.qwen/review-cache/` et suit à la fois le SHA du commit et l'ID du modèle. Assurez-vous que ce répertoire est dans votre `.gitignore` (une règle plus large comme `.qwen/*` fonctionne également). Si le commit en cache a été supprimé lors d'un rebase, le système revient à une revue complète.

## Rapports de revue

Pour les revues dans le même dépôt, les résultats sont enregistrés sous forme de fichier Markdown dans le répertoire `.qwen/reviews/` de votre projet (les revues légères inter-dépôts n'enregistrent pas de rapport) :

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Les rapports incluent : l'horodatage, les statistiques du diff, les résultats de build/test, toutes les découvertes avec leur statut de vérification, et le verdict.

## Analyse d'impact inter-fichiers

Lorsque les modifications de code altèrent des fonctions, classes ou interfaces exportées, les agents de revue recherchent automatiquement tous les appelants et vérifient la compatibilité :

- Modifications du nombre ou du type de paramètres
- Modifications du type de retour
- Méthodes publiques supprimées ou renommées
- Modifications de l'API entraînant une rupture de compatibilité

Pour les diffs importants (>10 symboles modifiés), l'analyse priorise les fonctions dont la signature a changé.

## Efficacité des tokens

Le pipeline de revue utilise un nombre limité d'appels au LLM, quel que soit le nombre de découvertes produites :

| Étape | Appels LLM | Notes |
|---|---|---|
| Agents de revue (Étape 3) | 10 (ou 9) | Exécutés en parallèle ; Agent 7 ignoré en mode inter-dépôts |
| Vérification par lot (Étape 4) | 1 | Un seul agent vérifie toutes les découvertes en une fois |
| Audit inverse itératif (Étape 5) | 1-3 | Boucle jusqu'à "Aucun problème trouvé" ou limite de 3 tours |
| **Total** | **12-14 (11-13)** | Même dépôt : 12-14 ; inter-dépôts : 11-13 (sans l'Agent 7) |

La plupart des PR convergent vers la limite inférieure de la plage (1 tour d'audit inverse) ; la limite supérieure évite l'explosion des coûts dans les cas pathologiques.

## Ce qui n'est PAS signalé

La revue exclut intentionnellement :

- Les problèmes préexistants dans le code non modifié (concentration uniquement sur le diff)
- Le style ou le formatage qu'un formateur normaliserait automatiquement, ou le nommage correspondant aux conventions de votre codebase — mais PAS les problèmes substantiels qu'un linter ou un vérificateur de types signalerait (variables inutilisées, code inatteignable, erreurs de type), qui sont dans le périmètre
- Les suggestions subjectives du type "envisagez de faire X" sans problème réel
- Le refactoring mineur qui ne corrige ni bug ni risque
- La documentation manquante, sauf si la logique est vraiment confuse
- Les problèmes déjà discutés dans les commentaires existants de la PR (évite de dupliquer les retours humains)

## Philosophie de conception

> **Le silence vaut mieux que le bruit.** Chaque commentaire doit mériter le temps du lecteur.

- En cas de doute sur le fait que quelque chose soit un problème → ne pas le signaler
- Même motif sur N fichiers → agrégé en une seule découverte
- Les commentaires de PR sont réservés aux problèmes à haute certitude
- Le style ou le formatage cosmétique correspondant aux conventions de la codebase est exclu