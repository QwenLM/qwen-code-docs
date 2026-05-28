---
description: "Faites une AI code review avec Qwen Code pour repérer bugs, problèmes de style et risques de sécurité avant le commit, et améliorer la qualité des PR."
---

# Revue de code

> Analysez les modifications de code pour vérifier leur exactitude, leur sécurité, leurs performances et leur qualité à l'aide de `/review`.

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

S'il n'y a aucune modification non validée, `/review` vous en informe et s'arrête — aucun agent n'est lancé.

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

### Agents de revue

| Agent                             | Focus                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 1 : Exactitude              | Erreurs de logique, cas limites, gestion des valeurs nulles, conditions de concurrence, sécurité des types |
| Agent 2 : Sécurité                | Injections, XSS, SSRF, contournement d'authentification, exposition de données sensibles    |
| Agent 3 : Qualité du code         | Cohérence du style, nommage, duplication, code mort                                         |
| Agent 4 : Performances et efficacité | Requêtes N+1, fuites de mémoire, re-rendus inutiles, taille du bundle                    |
| Agent 5 : Couverture des tests    | Chemins de code non testés dans le diff, couverture de branches manquante, assertions faibles |
| Agent 6 : Audit non dirigé        | 3 personas en parallèle (attaquant / astreinte nocturne / mainteneur) — détecte les problèmes transversaux |
| Agent 7 : Build & Test            | Exécute les commandes de build et de test, signale les échecs                               |

Tous les agents s'exécutent en parallèle (l'agent 6 lance 3 variantes de persona simultanément, ce qui représente 9 tâches parallèles pour les revues dans le même dépôt). Les résultats des agents 1 à 6 sont vérifiés en **une seule passe de vérification par lot** (un seul agent vérifie tous les résultats en une fois, ce qui maintient le coût de vérification fixe quel que soit le nombre de résultats). Après vérification, l'**audit inversé itératif** exécute 1 à 3 tours de recherche d'angles morts — chaque tour reçoit la liste cumulative des résultats des tours précédents, de sorte que les tours successifs se concentrent sur ce qui reste à découvrir. La boucle s'arrête dès qu'un tour retourne "Aucun problème trouvé", ou après 3 tours (plafond strict). Les résultats de l'audit inversé sautent la vérification (l'agent dispose déjà du contexte complet) et sont inclus comme résultats à haute confiance.

## Analyse déterministe

Avant l'exécution des agents LLM, `/review` lance automatiquement les linters et vérificateurs de types existants de votre projet :

| Language              | Tools detected                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (if `compile_commands.json` available)              |
| Other                 | Auto-discovered from CI config (`.github/workflows/*.yml`, etc.) |

Pour les projets qui ne correspondent pas aux modèles standards (ex. OpenJDK), `/review` lit les fichiers de configuration CI pour découvrir les commandes de lint/vérification utilisées par le projet. Aucune configuration utilisateur n'est nécessaire.

Les résultats déterministes sont étiquetés `[linter]` ou `[typecheck]` et sautent la vérification LLM — ils constituent la référence absolue.

- **Erreurs** → Sévérité critique
- **Avertissements** → Amélioration facultative (terminal uniquement, non publiés en commentaires de PR)

Si un outil n'est pas installé ou expire, il est ignoré avec une note d'information.

## Niveaux de sévérité

| Severity         | Meaning                                                             | Posted as PR comment?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critique**     | Doit être corrigé avant le merge (bugs, sécurité, perte de données, échecs de build) | Oui (haute confiance uniquement) |
| **Suggestion**   | Amélioration recommandée                                            | Oui (haute confiance uniquement) |
| **Amélioration facultative** | Optimisation optionnelle                                      | Non (terminal uniquement)  |

Les résultats à faible confiance apparaissent dans une section distincte "Nécessite une revue humaine" dans le terminal et ne sont jamais publiés en commentaires de PR.

## Correction automatique

Après avoir présenté les résultats, `/review` propose d'appliquer automatiquement les corrections pour les résultats Critiques et Suggestions disposant de solutions claires :

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- Les corrections sont appliquées via l'outil `edit` (remplacements ciblés, pas de réécriture complète de fichiers)
- Des vérifications de linter par fichier sont exécutées après les corrections pour s'assurer qu'elles n'introduisent pas de nouveaux problèmes
- Pour les revues de PR, les corrections sont commitées et poussées automatiquement depuis le worktree — votre working tree reste propre
- Les améliorations facultatives et les résultats à faible confiance ne sont jamais corrigés automatiquement
- La soumission de la revue de PR utilise toujours le **verdict avant correction** (ex. "Request changes") car la PR distante n'a pas été mise à jour tant que le push de correction automatique n'est pas terminé

## Isolation via worktree

Lors de la revue d'une PR, `/review` crée un worktree git temporaire (`.qwen/tmp/review-pr-<number>`) au lieu de basculer votre branche actuelle. Cela signifie que :

- Votre working tree, les modifications indexées et la branche actuelle ne sont **jamais modifiés**
- Les dépendances sont installées dans le worktree (`npm ci`, etc.) pour que le linting et le build/test fonctionnent
- Les commandes de build et de test s'exécutent en isolation sans polluer votre cache de build local
- En cas de problème, votre environnement reste intact — il suffit de supprimer le worktree
- Le worktree est automatiquement nettoyé une fois la revue terminée
- Si une revue est interrompue (Ctrl+C, crash), la prochaine `/review` de la même PR nettoie automatiquement le worktree obsolète avant de recommencer
- Les rapports de revue et le cache sont sauvegardés dans le répertoire principal du projet (pas dans le worktree)

## Revue de PR cross-repo

Vous pouvez revoir des PR d'autres dépôts en passant l'URL complète :

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Cela s'exécute en **mode léger** — pas de worktree, pas de linter, pas de build/test, pas de correction automatique. La revue se base uniquement sur le texte du diff (récupéré via l'API GitHub). Les commentaires de PR peuvent toujours être publiés si vous disposez des droits d'écriture.

| Capability                                       | Same-repo | Cross-repo                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| LLM review (Agents 1-6 + verify + iterative reverse audit) | ✅        | ✅                            |
| Agent 7: Build & test                                      | ✅        | ❌ (no local codebase)        |
| Deterministic analysis (linter/typecheck)        | ✅        | ❌                            |
| Cross-file impact analysis                       | ✅        | ❌                            |
| Autofix                                          | ✅        | ❌                            |
| PR inline comments                               | ✅        | ✅ (if you have write access) |
| Incremental review cache                         | ✅        | ❌                            |

## Commentaires en ligne sur les PR

Utilisez `--comment` pour publier les résultats directement sur la PR :

```bash
/review 123 --comment
```

Ou, après avoir exécuté `/review 123`, tapez `post comments` pour publier les résultats sans relancer la revue.

**Ce qui est publié :**

- Les résultats Critiques et Suggestions à haute confiance sous forme de commentaires en ligne sur des lignes spécifiques
- Pour les verdicts Approve/Request changes : un résumé de revue avec le verdict
- Pour le verdict Comment avec tous les commentaires en ligne publiés : pas de résumé séparé (les commentaires en ligne suffisent)
- Pied de page d'attribution du modèle sur chaque commentaire (ex. _— qwen3-coder via Qwen Code /review_)

**Ce qui reste dans le terminal uniquement :**

- Les améliorations facultatives (y compris les avertissements de linter)
- Les résultats à faible confiance

**PR dont vous êtes l'auteur :** GitHub ne permet pas de soumettre des revues `APPROVE` ou `REQUEST_CHANGES` sur votre propre pull request — les deux échouent avec une erreur HTTP 422. Lorsque `/review` détecte que l'auteur de la PR correspond à l'utilisateur actuellement authentifié, il dégrade automatiquement l'événement API en `COMMENT` quel que soit le verdict, afin que la soumission réussisse. Le terminal affiche toujours le verdict honnête ("Approve" / "Request changes" / "Comment") — seul l'événement de revue côté GitHub est neutralisé. Les résultats réels apparaissent toujours sous forme de commentaires en ligne sur des lignes spécifiques, donc le feedback substantiel reste inchangé.

**Revue d'une PR contenant déjà des commentaires Qwen Code :** lorsque `/review` s'exécute sur une PR qui possède déjà des commentaires de revue Qwen Code, il les classe avant de publier les nouveaux. Seul un **conflit sur la même ligne** (un commentaire existant sur le même `(path, line)` qu'un nouveau résultat) vous demande confirmation — c'est le cas où vous verriez un doublon visuel sur la même ligne de code. Les commentaires d'anciens commits, les commentaires ayant reçu une réponse (considérés comme résolus) et les commentaires qui ne chevauchent aucun nouveau résultat sont ignorés silencieusement, avec une ligne de log dans le terminal pour vous indiquer ce qui a été filtré.

**Vérification du statut CI / build avant APPROVE :** si le verdict est "Approve", `/review` interroge les check-runs et les statuts de commit de la PR avant la soumission. Si un check a échoué (ou si tous les checks sont encore en attente), l'événement API est automatiquement dégradé de `APPROVE` à `COMMENT`, le corps de la revue expliquant pourquoi. Raison : la revue LLM lit le code statiquement et ne peut pas voir les échecs de tests à l'exécution ; approuver alors que la CI est au rouge serait trompeur. Les résultats en ligne sont toujours publiés sans modification. Si vous souhaitez approuver quand même (ex. échec CI connu comme instable), soumettez l'approbation GitHub manuellement après vérification.

## Actions de suivi

Après la revue, des conseils contextuels apparaissent en texte fantôme. Appuyez sur Tab pour les accepter :

| State after review                 | Tip                | What happens                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Local review with unfixed findings | `fix these issues` | Le LLM corrige chaque résultat de manière interactive |
| PR review with findings            | `post comments`    | Publie les commentaires en ligne de la PR (sans nouvelle revue) |
| PR review, zero findings           | `post comments`    | Approuve la PR sur GitHub (LGTM)        |
| Local review, all clear            | `commit`           | Valide vos modifications                |

Remarque : `fix these issues` est uniquement disponible pour les revues locales. Pour les revues de PR, utilisez la Correction automatique (Étape 8) — le worktree est nettoyé après la revue, donc la correction interactive post-revue n'est pas possible.

## Règles de revue du projet

Vous pouvez personnaliser les critères de revue par projet. `/review` lit les règles depuis ces fichiers (dans l'ordre) :

1. `.qwen/review-rules.md` (natif Qwen Code)
2. `.github/copilot-instructions.md` (préféré) ou `copilot-instructions.md` (secours — un seul est chargé, pas les deux)
3. `AGENTS.md` — section `## Code Review`
4. `QWEN.md` — section `## Code Review`

Les règles sont injectées dans les agents de revue LLM (1-6) comme critères supplémentaires. Pour les revues de PR, les règles sont lues depuis la **branche de base** pour empêcher une PR malveillante d'injecter des règles de contournement.

Exemple `.qwen/review-rules.md` :

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Revue incrémentale

Lors de la revue d'une PR déjà revue, `/review` examine uniquement les modifications depuis la dernière revue :

```bash
# First review — full review, cache created
/review 123

# PR updated with new commits — only new changes reviewed
/review 123
```

### Revue cross-model

Si vous changez de modèle (via `/model`) et revoyez la même PR, `/review` détecte le changement et exécute une revue complète au lieu de passer :

```bash
# Review with model A
/review 123

# Switch model
/model

# Review again — full review with model B (not skipped)
/review 123
# → "Previous review used qwen3-coder. Running full review with gpt-4o for a second opinion."
```

Le cache est stocké dans `.qwen/review-cache/` et suit à la fois le SHA du commit et l'ID du modèle. Assurez-vous que ce répertoire est dans votre `.gitignore` (une règle plus large comme `.qwen/*` fonctionne aussi). Si le commit mis en cache a été supprimé par un rebase, le système revient à une revue complète.

## Rapports de revue

Pour les revues dans le même dépôt, les résultats sont sauvegardés sous forme de fichier Markdown dans le répertoire `.qwen/reviews/` de votre projet (les revues cross-repo en mode léger ne persistent pas de rapport) :

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Les rapports incluent : horodatage, statistiques du diff, résultats de l'analyse déterministe, tous les résultats avec leur statut de vérification, et le verdict.

## Analyse d'impact cross-fichier

Lorsque des modifications de code affectent des fonctions, classes ou interfaces exportées, les agents de revue recherchent automatiquement tous les appelants et vérifient la compatibilité :

- Modifications du nombre/type de paramètres
- Modifications du type de retour
- Méthodes publiques supprimées ou renommées
- Modifications d'API incompatibles (breaking changes)

Pour les diffs volumineux (>10 symboles modifiés), l'analyse priorise les fonctions dont la signature a changé.

## Efficacité des tokens

Le pipeline de revue utilise un nombre limité d'appels LLM, quel que soit le nombre de résultats produits :

| Stage                            | LLM calls         | Notes                                                |
| -------------------------------- | ----------------- | ---------------------------------------------------- |
| Deterministic analysis (Step 3)  | 0                 | Commandes shell uniquement                           |
| Review agents (Step 4)           | 9 (or 8)          | Exécution en parallèle ; Agent 7 ignoré en mode cross-repo |
| Batch verification (Step 5)      | 1                 | Un seul agent vérifie tous les résultats en une fois |
| Iterative reverse audit (Step 6) | 1-3               | Boucle jusqu'à "Aucun problème trouvé" ou plafond de 3 tours |
| **Total**                        | **11-13 (10-12)** | Même dépôt : 11-13 ; cross-repo : 10-12 (pas d'Agent 7) |

La plupart des PR convergent vers le bas de la fourchette (1 tour d'audit inversé) ; le plafond empêche les coûts incontrôlés sur les cas pathologiques.

## Ce qui n'est PAS signalé

La revue exclut intentionnellement :

- Les problèmes préexistants dans le code inchangé (focus sur le diff uniquement)
- Le style/formatage/nommage correspondant aux conventions de votre codebase
- Les problèmes qu'un linter ou vérificateur de types détecterait (gérés par l'analyse déterministe)
- Les suggestions subjectives "pensez à faire X" sans problème réel
- Les refactorisations mineures qui ne corrigent pas un bug ou un risque
- La documentation manquante, sauf si la logique est véritablement confuse
- Les problèmes déjà discutés dans les commentaires existants de la PR (évite de dupliquer le feedback humain)

## Philosophie de conception

> **Le silence vaut mieux que le bruit.** Chaque commentaire doit mériter le temps du lecteur.

- Si vous n'êtes pas sûr qu'il s'agisse d'un problème → ne le signalez pas
- Les problèmes de linter/typecheck sont gérés par des outils, pas par des suppositions LLM
- Même motif sur N fichiers → agrégé en un seul résultat
- Les commentaires de PR sont à haute confiance uniquement
- Les problèmes de style/formatage correspondant aux conventions du codebase sont exclus