# Revue de code

> Examinez les modifications de code pour leur exactitude, leur sécurité, leurs performances et leur qualité à l'aide de `/review`.

## Démarrage rapide

```bash
# Review local uncommitted changes
/review

# Review a pull request (by number or URL)
/review 123
/review https://github.com/org/repo/pull/123

# Review and post inline comments on the PR
/review 123 --comment

# Review a specific file
/review src/utils/auth.ts
```

S'il n'y a aucune modification non validée, `/review` vous en informera et s'arrêtera — aucun agent n'est lancé.

## Fonctionnement

La commande `/review` exécute un pipeline en plusieurs étapes :

```
Step 1:  Determine scope (local diff / PR worktree / file)
Step 2:  Load project review rules
Step 3:  Run deterministic analysis (linter, typecheck)    [zero LLM cost]
Step 4:  9 parallel review agents                          [9 LLM calls]
           |-- Agent 1: Correctness
           |-- Agent 2: Security
           |-- Agent 3: Code Quality
           |-- Agent 4: Performance & Efficiency
           |-- Agent 5: Test Coverage
           |-- Agent 6: Undirected Audit (3 personas: 6a/6b/6c)
           '-- Agent 7: Build & Test (runs shell commands)
Step 5:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 6:  Iterative reverse audit (1-3 rounds, gap finding) [1-3 LLM calls]
Step 7:  Present findings + verdict
Step 8:  Autofix (user-confirmed, optional)
Step 9:  Post PR inline comments (if requested)
Step 10: Save report + incremental cache
Step 11: Clean up (remove worktree + temp files)
```

### Agents de révision

| Agent                               | Objectif                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------- |
| Agent 1 : Exactitude                | Erreurs logiques, cas limites, gestion de null, conditions de concurrence, sécurité de type   |
| Agent 2 : Sécurité                  | Injection, XSS, SSRF, contournement d'authentification, exposition de données sensibles       |
| Agent 3 : Qualité du code           | Cohérence de style, nommage, duplication, code mort                                            |
| Agent 4 : Performance et efficacité | Requêtes N+1, fuites mémoire, rendus inutiles, taille du bundle                               |
| Agent 5 : Couverture de test        | Chemins de code non testés dans la diff, couverture de branche manquante, assertions faibles   |
| Agent 6 : Audit non dirigé          | 3 personas parallèles (attaquant / astreinte à 3h du matin / mainteneur) — détecte les problèmes transversaux |
| Agent 7 : Compilation et test       | Exécute les commandes de build et de test, signale les échecs                                  |

Tous les agents s'exécutent en parallèle (l'Agent 6 lance 3 variantes de persona simultanément, pour un total de 9 tâches parallèles pour les révisions du même dépôt). Les résultats des Agents 1 à 6 sont vérifiés en **un seul passage de vérification par lots** (un agent examine tous les résultats en une fois, ce qui maintient le coût de vérification fixe quel que soit le nombre de résultats). Après vérification, **l'audit inverse itératif** effectue 1 à 3 tours de recherche d'écarts — chaque tour reçoit la liste cumulative des résultats des tours précédents, de sorte que les tours successifs se concentrent sur ce qui reste à découvrir. La boucle s'arrête dès qu'un tour renvoie « Aucun problème trouvé », ou après 3 tours (limite stricte). Les résultats de l'audit inverse ne sont pas vérifiés (l'agent dispose déjà du contexte complet) et sont inclus comme résultats de haute confiance.

## Analyse déterministe

Avant que les agents LLM ne s'exécutent, `/review` lance automatiquement les linters et vérificateurs de types existants de votre projet :

| Langage              | Outils détectés                                                      |
| -------------------- | -------------------------------------------------------------------- |
| TypeScript/JavaScript| `tsc --noEmit`, `npm run lint`, `eslint`                             |
| Python               | `ruff`, `mypy`, `flake8`                                             |
| Rust                 | `cargo clippy`                                                       |
| Go                   | `go vet`, `golangci-lint`                                            |
| Java                 | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                       |
| C/C++                | `clang-tidy` (si `compile_commands.json` disponible)                 |
| Autre                | Détecté automatiquement depuis la configuration CI (`.github/workflows/*.yml`, etc.) |

Pour les projets qui ne correspondent pas aux modèles standard (par exemple OpenJDK), `/review` lit les fichiers de configuration CI pour découvrir les commandes de lint/vérification utilisées par le projet. Aucune configuration utilisateur n'est nécessaire.

Les résultats déterministes sont étiquetés avec `[linter]` ou `[typecheck]` et ne sont pas vérifiés par LLM — ce sont des vérités de base.

- **Erreurs** → Gravité critique
- **Avertissements** → Optionnel (terminal uniquement, pas de commentaires PR)

Si un outil n'est pas installé ou expire, il est ignoré avec une note informative.

## Niveaux de gravité

| Gravité           | Signification                                                         | Publié en commentaire PR ? |
| ----------------- | --------------------------------------------------------------------- | -------------------------- |
| **Critique**      | À corriger avant fusion (bugs, sécurité, perte de données, échecs de build) | Oui (haute confiance uniquement) |
| **Suggestion**    | Amélioration recommandée                                              | Oui (haute confiance uniquement) |
| **Optionnel**     | Optimisation facultative                                              | Non (terminal uniquement)  |
Les constatations à faible confiance apparaissent dans une section distincte « Nécessite un examen humain » dans le terminal et ne sont jamais publiées en tant que commentaires de PR.

## Correction automatique

Après avoir présenté les constatations, `/review` propose d'appliquer automatiquement les corrections pour les constatations de type Critique et Suggestion qui ont des solutions claires :

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- Les corrections sont appliquées à l'aide de l'outil `edit` (remplacements ciblés, pas de réécriture complète de fichier)
- Des vérifications de lint par fichier sont effectuées après les corrections pour vérifier qu'elles n'introduisent pas de nouveaux problèmes
- Pour les révisions de PR, les corrections sont validées et poussées depuis le worktree automatiquement — votre arbre de travail reste propre
- Les constatations « Nice to have » et à faible confiance ne sont jamais corrigées automatiquement
- La soumission de la révision de PR utilise toujours le **verdict pré-correction** (par exemple, « Request changes ») car la PR distante n'a pas été mise à jour tant que l'envoi de la correction automatique n'est pas terminé

## Isolation du worktree

Lors de la révision d'une PR, `/review` crée un worktree git temporaire (`.qwen/tmp/review-pr-<number>`) au lieu de changer votre branche actuelle. Cela signifie :

- Votre arbre de travail, vos modifications en staging et votre branche actuelle ne sont **jamais touchés**
- Les dépendances sont installées dans le worktree (`npm ci`, etc.) pour que le linting et la construction/les tests fonctionnent
- Les commandes de construction et de test s'exécutent en isolation sans polluer votre cache de construction local
- Si quelque chose se passe mal, votre environnement n'est pas affecté — il suffit de supprimer le worktree
- Le worktree est automatiquement nettoyé après la fin de la révision
- Si une révision est interrompue (Ctrl+C, plantage), la prochaine `/review` de la même PR nettoie automatiquement le worktree obsolète avant de recommencer à zéro
- Les rapports de révision et le cache sont enregistrés dans le répertoire principal du projet (pas dans le worktree)

## Révision de PR cross-repo

Vous pouvez réviser des PR d'autres dépôts en passant l'URL complète :

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Cela s'exécute en **mode léger** — pas de worktree, pas de linter, pas de construction/test, pas de correction automatique. La révision est basée uniquement sur le texte du diff (récupéré via l'API GitHub). Les commentaires de PR peuvent toujours être publiés si vous avez un accès en écriture.

| Capacité                                                              | Même dépôt | Cross-repo                    |
| --------------------------------------------------------------------- | ---------- | ----------------------------- |
| Révision LLM (Agents 1-6 + vérification + audit inverse itératif)     | ✅         | ✅                            |
| Agent 7 : Construction et test                                        | ✅         | ❌ (pas de codebase local)    |
| Analyse déterministe (linter/vérification de types)                   | ✅         | ❌                            |
| Analyse d'impact inter-fichiers                                       | ✅         | ❌                            |
| Correction automatique                                                | ✅         | ❌                            |
| Commentaires en ligne de PR                                           | ✅         | ✅ (si vous avez un accès en écriture) |
| Cache de révision incrémentiel                                        | ✅         | ❌                            |

## Commentaires en ligne de PR

Utilisez `--comment` pour publier les constatations directement sur la PR :

```bash
/review 123 --comment
```

Ou, après avoir exécuté `/review 123`, tapez `post comments` pour publier les constatations sans relancer la révision.

**Ce qui est publié :**

- Les constatations de type Critique et Suggestion à haute confiance en tant que commentaires en ligne sur des lignes spécifiques
- Pour les verdicts Approuver/Demander des modifications : un résumé de révision avec le verdict
- Pour le verdict Commenter avec tous les commentaires en ligne publiés : pas de résumé séparé (les commentaires en ligne sont suffisants)
- Pied de page d'attribution du modèle sur chaque commentaire (par exemple, _— qwen3-coder via Qwen Code /review_)

**Ce qui reste uniquement dans le terminal :**

- Les constatations « Nice to have » (y compris les avertissements du linter)
- Les constatations à faible confiance

**PR auto-écrites :** GitHub ne vous permet pas de soumettre des révisions `APPROVE` ou `REQUEST_CHANGES` sur votre propre pull request — les deux échouent avec HTTP 422. Lorsque `/review` détecte que l'auteur de la PR correspond à l'utilisateur authentifié actuel, il rétrograde automatiquement l'événement API en `COMMENT` quel que soit le verdict, de sorte que la soumission réussit quand même. Le terminal affiche toujours le verdict honnête (« Approuver » / « Demander des modifications » / « Commenter ») — seul l'événement de révision côté GitHub est neutralisé. Les constatations réelles apparaissent toujours en tant que commentaires en ligne sur des lignes spécifiques, donc les retours substantiels restent inchangés.

**Révision d'une PR avec des commentaires Qwen Code antérieurs :** lorsque `/review` s'exécute sur une PR qui a déjà des commentaires de révision Qwen Code précédents, il les classe avant d'en publier de nouveaux. Seul un **chevauchement sur la même ligne** (un commentaire existant sur le même `(path, line)` qu'une nouvelle constatation) vous invite à confirmer — c'est le cas où vous verriez un doublon visuel sur la même ligne de code. Les commentaires de commits plus anciens, les commentaires ayant reçu une réponse (considérés comme résolus) et les commentaires qui ne chevauchent simplement aucune nouvelle constatation sont ignorés silencieusement, avec une ligne de journal dans le terminal pour que vous sachiez ce qui a été filtré.

**Vérification CI / statut de construction avant APPROVE :** si le verdict est « Approuver », `/review` interroge les exécutions de vérification et les statuts de commit de la PR avant de soumettre. Si une vérification a échoué (ou si toutes les vérifications sont encore en attente), l'événement API est automatiquement rétrogradé de `APPROVE` à `COMMENT`, avec le corps de la révision expliquant pourquoi. Raisonnement : la révision LLM lit le code statiquement et ne peut pas voir les échecs de test à l'exécution ; approuver alors que la CI est rouge serait trompeur. Les constatations en ligne sont toujours publiées inchangées. Si vous voulez approuver malgré tout (par exemple, un échec CI connu comme instable), soumettez l'approbation GitHub manuellement après vérification.
## Actions de suivi

Après la revue, des astuces contextuelles apparaissent sous forme de texte fantôme. Appuyez sur Tab pour accepter :

| État après la revue                              | Astuce                | Effet                                           |
| ------------------------------------------------ | --------------------- | ----------------------------------------------- |
| Revue locale avec des résultats non corrigés     | `fix these issues`    | L'IA corrige interactivement chaque résultat    |
| Revue de PR avec des résultats                   | `post comments`       | Publie des commentaires inline (sans re-revue)  |
| Revue de PR, aucun résultat                      | `post comments`       | Approuve la PR sur GitHub (LGTM)                |
| Revue locale, tout est bon                       | `commit`              | Valide vos modifications                        |

Note : `fix these issues` est disponible uniquement pour les revues locales. Pour les revues de PR, utilisez Autofix (Étape 8) — l'arborescence de travail est nettoyée après la revue, donc la correction interactive post-revue n'est pas possible.

## Règles de revue par projet

Vous pouvez personnaliser les critères de revue par projet. `/review` lit les règles depuis ces fichiers (dans l'ordre) :

1. `.qwen/review-rules.md` (natif Qwen Code)
2. `.github/copilot-instructions.md` (préféré) ou `copilot-instructions.md` (solution de repli — un seul est chargé, pas les deux)
3. `AGENTS.md` — section `## Code Review`
4. `QWEN.md` — section `## Code Review`

Les règles sont injectées dans les agents de revue IA (1-6) comme critères supplémentaires. Pour les revues de PR, les règles sont lues depuis la **branche de base** pour empêcher une PR malveillante d'injecter des règles de contournement.

Exemple `.qwen/review-rules.md` :

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Revue incrémentale

Lors de la revue d'une PR déjà examinée, `/review` n'analyse que les modifications depuis la dernière revue :

```bash
# Première revue — revue complète, cache créé
/review 123

# PR mise à jour avec de nouveaux commits — seules les nouvelles modifications sont revues
/review 123
```

### Revue inter-modèle

Si vous changez de modèle (via `/model`) et réexaminez la même PR, `/review` détecte le changement de modèle et effectue une revue complète au lieu de sauter :

```bash
# Revue avec le modèle A
/review 123

# Changement de modèle
/model

# Nouvelle revue — revue complète avec le modèle B (non ignorée)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

Le cache est stocké dans `.qwen/review-cache/` et suit à la fois le SHA du commit et l'ID du modèle. Assurez-vous que ce répertoire est dans votre `.gitignore` (une règle plus large comme `.qwen/*` fonctionne aussi). Si le commit en cache a été rebasé, le système revient à une revue complète.

## Rapports de revue

Pour les revues sur le même dépôt, les résultats sont sauvegardés sous forme de fichier Markdown dans le répertoire `.qwen/reviews/` du projet (les revues légères inter-dépôts ignorent la persistance des rapports) :

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Les rapports incluent : horodatage, statistiques de diff, résultats d'analyse déterministe, tous les résultats avec leur statut de vérification, et le verdict.

## Analyse d'impact inter-fichiers

Lorsque des modifications de code affectent des fonctions, classes ou interfaces exportées, les agents de revue recherchent automatiquement tous les appelants et vérifient la compatibilité :

- Changements du nombre/type des paramètres
- Changements du type de retour
- Méthodes publiques supprimées ou renommées
- Changements d'API cassants

Pour les gros diffs (>10 symboles modifiés), l'analyse priorise les fonctions avec des changements de signature.

## Efficacité des tokens

Le pipeline de revue utilise un nombre limité d'appels LLM, quel que soit le nombre de résultats produits :

| Étape                              | Appels LLM       | Notes                                                |
| ---------------------------------- | ---------------- | ---------------------------------------------------- |
| Analyse déterministe (Étape 3)     | 0                | Commandes shell uniquement                            |
| Agents de revue (Étape 4)          | 9 (ou 8)         | Exécutés en parallèle ; Agent 7 ignoré en mode inter-dépôt |
| Vérification par lot (Étape 5)     | 1                | Un seul agent vérifie tous les résultats à la fois    |
| Audit inverse itératif (Étape 6)   | 1-3              | Boucle jusqu'à "Aucun problème trouvé" ou limite de 3 tours |
| **Total**                         | **11-13 (10-12)** | Même dépôt : 11-13 ; inter-dépôt : 10-12 (sans Agent 7) |

La plupart des PR convergent vers la borne inférieure de la plage (1 tour d'audit inverse) ; la limite empêche les coûts incontrôlés dans les cas pathologiques.

## Ce qui N'EST PAS signalé

La revue exclut intentionnellement :

- Les problèmes préexistants dans du code non modifié (concentrez-vous sur le diff uniquement)
- Les problèmes de style/formatage/nommage qui respectent les conventions de votre codebase
- Les problèmes qu'un linter ou un vérificateur de types attraperait (traités par l'analyse déterministe)
- Les suggestions subjectives du type "envisagez de faire X" sans problème réel
- Les refactorisations mineures qui ne corrigent pas un bug ou un risque
- La documentation manquante, sauf si la logique est réellement déroutante
- Les problèmes déjà abordés dans les commentaires existants de la PR (évite de dupliquer les retours humains)
## Philosophie de conception

> **Le silence vaut mieux que le bruit.** Chaque commentaire devrait mériter le temps du lecteur.

- Si vous n'êtes pas sûr qu'il s'agisse d'un problème → ne le signalez pas
- Les problèmes de linter/typecheck sont gérés par les outils, pas par les suppositions du LLM
- Même motif dans N fichiers → regroupé en une seule observation
- Les commentaires de PR sont à haute confiance uniquement
- Les problèmes de style/formatage correspondant aux conventions du codebase sont exclus
