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
Step 4:  5 parallel review agents                          [5 LLM calls]
           |-- Agent 1: Correctness & Security
           |-- Agent 2: Code Quality
           |-- Agent 3: Performance & Efficiency
           |-- Agent 4: Undirected Audit
           '-- Agent 5: Build & Test (runs shell commands)
Step 5:  Deduplicate --> Batch verify --> Aggregate         [1 LLM call]
Step 6:  Reverse audit (find coverage gaps)                 [1 LLM call]
Step 7:  Present findings + verdict
Step 8:  Autofix (user-confirmed, optional)
Step 9:  Post PR inline comments (if requested)
Step 10: Save report + incremental cache
Step 11: Clean up (remove worktree + temp files)
```

### Agents de revue

| Agent                             | Focus                                                              |
| --------------------------------- | ------------------------------------------------------------------ |
| Agent 1: Correctness & Security   | Erreurs logiques, gestion des valeurs nulles, conditions de course, injections, XSS, SSRF |
| Agent 2: Code Quality             | Cohérence du style, nommage, duplication, code mort                  |
| Agent 3: Performance & Efficiency | Requêtes N+1, fuites mémoire, re-rendus inutiles, taille du bundle     |
| Agent 4: Undirected Audit         | Logique métier, interactions aux limites, couplage caché             |
| Agent 5: Build & Test             | Exécute les commandes de build et de test, signale les échecs                     |

Tous les agents s'exécutent en parallèle. Les résultats des agents 1 à 4 sont vérifiés en **une seule passe de vérification par lot** (un agent examine tous les résultats simultanément, ce qui maintient un nombre fixe d'appels LLM). Après vérification, un **agent d'audit inverse** relit l'intégralité du diff en tenant compte de tous les résultats confirmés afin de détecter les problèmes que les autres agents ont manqués. Les résultats de l'audit inverse ignorent l'étape de vérification (l'agent dispose déjà du contexte complet) et sont directement inclus comme résultats à haute confiance.

## Analyse déterministe

Avant l'exécution des agents LLM, `/review` lance automatiquement les linters et vérificateurs de type existants de votre projet :

| Langage              | Outils détectés                                                   |
| --------------------- | ---------------------------------------------------------------- |
| TypeScript/JavaScript | `tsc --noEmit`, `npm run lint`, `eslint`                         |
| Python                | `ruff`, `mypy`, `flake8`                                         |
| Rust                  | `cargo clippy`                                                   |
| Go                    | `go vet`, `golangci-lint`                                        |
| Java                  | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                   |
| C/C++                 | `clang-tidy` (si `compile_commands.json` disponible)              |
| Autre                 | Découverts automatiquement depuis la config CI (`.github/workflows/*.yml`, etc.) |

Pour les projets qui ne correspondent pas aux modèles standards (ex. OpenJDK), `/review` lit les fichiers de configuration CI pour découvrir les commandes de lint/vérification utilisées par le projet. Aucune configuration utilisateur n'est nécessaire.

Les résultats déterministes sont tagués `[linter]` ou `[typecheck]` et ignorent la vérification LLM — ils font autorité.

- **Erreurs** → Sévérité critique
- **Avertissements** → Nice to have (terminal uniquement, non publiés en commentaires PR)

Si un outil n'est pas installé ou expire, il est ignoré avec une note informative.

## Niveaux de sévérité

| Sévérité         | Signification                                                             | Publié en commentaire PR ?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critique**     | Doit être corrigé avant le merge (bugs, sécurité, perte de données, échecs de build) | Oui (haute confiance uniquement) |
| **Suggestion**   | Amélioration recommandée                                             | Oui (haute confiance uniquement) |
| **Nice to have** | Optimisation optionnelle                                               | Non (terminal uniquement)         |

Les résultats à faible confiance apparaissent dans une section distincte "Nécessite une revue humaine" dans le terminal et ne sont jamais publiés en commentaires PR.

## Correction automatique (Autofix)

Après avoir présenté les résultats, `/review` propose d'appliquer automatiquement des correctifs pour les résultats Critiques et Suggestions disposant de solutions claires :

```
Found 3 issues with auto-fixable suggestions. Apply auto-fixes? (y/n)
```

- Les correctifs sont appliqués via l'outil `edit` (remplacements ciblés, pas de réécriture complète du fichier)
- Des vérifications linter par fichier sont exécutées après les correctifs pour s'assurer qu'ils n'introduisent pas de nouveaux problèmes
- Pour les revues PR, les correctifs sont commités et pushés automatiquement depuis le worktree — votre working tree reste propre
- Les résultats Nice to have et à faible confiance ne sont jamais corrigés automatiquement
- La soumission de la revue PR utilise toujours le **verdict pré-correction** (ex. "Request changes") car la PR distante n'est mise à jour qu'une fois le push de l'autofix terminé

## Isolation via Worktree

Lors de la revue d'une PR, `/review` crée un git worktree temporaire (`.qwen/tmp/review-pr-<number>`) au lieu de basculer votre branche actuelle. Cela signifie que :

- Votre working tree, les modifications stagées et votre branche actuelle ne sont **jamais modifiés**
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

Cela s'exécute en **mode léger** — pas de worktree, pas de linter, pas de build/test, pas d'autofix. La revue se base uniquement sur le texte du diff (récupéré via l'API GitHub). Les commentaires PR peuvent toujours être publiés si vous avez les droits d'écriture.

| Fonctionnalité                                       | Même dépôt | Cross-repo                    |
| ------------------------------------------------ | --------- | ----------------------------- |
| Revue LLM (Agents 1-4 + vérification + audit inverse) | ✅        | ✅                            |
| Agent 5: Build et test                            | ✅        | ❌ (pas de codebase local)        |
| Analyse déterministe (linter/typecheck)        | ✅        | ❌                            |
| Analyse d'impact cross-file                       | ✅        | ❌                            |
| Autofix                                          | ✅        | ❌                            |
| Commentaires inline PR                               | ✅        | ✅ (si vous avez les droits d'écriture) |
| Cache de revue incrémentale                         | ✅        | ❌                            |

## Commentaires inline PR

Utilisez `--comment` pour publier les résultats directement sur la PR :

```bash
/review 123 --comment
```

Ou, après avoir exécuté `/review 123`, tapez `post comments` pour publier les résultats sans relancer la revue.

**Ce qui est publié :**

- Les résultats Critiques et Suggestions à haute confiance sous forme de commentaires inline sur des lignes spécifiques
- Pour les verdicts Approve/Request changes : un résumé de revue avec le verdict
- Pour le verdict Comment avec tous les commentaires inline publiés : pas de résumé séparé (les commentaires inline suffisent)
- Pied de page d'attribution du modèle sur chaque commentaire (ex. _— qwen3-coder via Qwen Code /review_)

**Ce qui reste uniquement dans le terminal :**

- Les résultats Nice to have (y compris les avertissements du linter)
- Les résultats à faible confiance

## Actions de suivi

Après la revue, des conseils contextuels apparaissent sous forme de ghost text. Appuyez sur Tab pour les accepter :

| État après revue                 | Conseil                | Ce qui se passe                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Revue locale avec résultats non corrigés | `fix these issues` | Le LLM corrige interactivement chaque résultat    |
| Revue PR avec résultats            | `post comments`    | Publie les commentaires inline PR (pas de re-revue) |
| Revue PR, zéro résultat           | `post comments`    | Approuve la PR sur GitHub (LGTM)        |
| Revue locale, tout est clair            | `commit`           | Commit vos modifications                    |

Remarque : `fix these issues` n'est disponible que pour les revues locales. Pour les revues PR, utilisez l'Autofix (Étape 8) — le worktree est nettoyé après la revue, rendant la correction interactive post-revue impossible.

## Règles de revue du projet

Vous pouvez personnaliser les critères de revue par projet. `/review` lit les règles depuis ces fichiers (dans l'ordre) :

1. `.qwen/review-rules.md` (natif Qwen Code)
2. `.github/copilot-instructions.md` (préféré) ou `copilot-instructions.md` (secours — un seul est chargé, pas les deux)
3. `AGENTS.md` — section `## Code Review`
4. `QWEN.md` — section `## Code Review`

Les règles sont injectées dans les agents de revue LLM (1-4) comme critères supplémentaires. Pour les revues PR, les règles sont lues depuis la **branche de base** pour empêcher une PR malveillante d'injecter des règles de contournement.

Exemple `.qwen/review-rules.md` :

```markdown
# Review Rules

- All API endpoints must validate authentication
- Database queries must use parameterized statements
- React components must not use inline styles
- Error messages must not expose internal paths
```

## Revue incrémentale

Lors de la revue d'une PR déjà revue, `/review` n'examine que les modifications depuis la dernière revue :

```bash
# First review — full review, cache created
/review 123

# PR updated with new commits — only new changes reviewed
/review 123
```

### Revue cross-model

Si vous changez de modèle (via `/model`) et relancez la revue sur la même PR, `/review` détecte le changement de modèle et exécute une revue complète au lieu de passer :

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

Pour les revues dans le même dépôt, les résultats sont sauvegardés sous forme de fichier Markdown dans le répertoire `.qwen/reviews/` de votre projet (les revues légères cross-repo ignorent la persistance des rapports) :

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Les rapports incluent : horodatage, statistiques du diff, résultats de l'analyse déterministe, tous les résultats avec leur statut de vérification, et le verdict.

## Analyse d'impact cross-file

Lorsque des modifications de code affectent des fonctions, classes ou interfaces exportées, les agents de revue recherchent automatiquement tous les appelants et vérifient la compatibilité :

- Modifications du nombre/type de paramètres
- Modifications du type de retour
- Méthodes publiques supprimées ou renommées
- Changements d'API breaking

Pour les diffs volumineux (>10 symboles modifiés), l'analyse priorise les fonctions dont la signature a changé.

## Efficacité des tokens

Le pipeline de revue utilise un nombre fixe d'appels LLM, quel que soit le nombre de résultats produits :

| Étape                           | Appels LLM  | Notes                                               |
| ------------------------------- | ---------- | --------------------------------------------------- |
| Analyse déterministe (Étape 3) | 0          | Commandes shell uniquement                                 |
| Agents de revue (Étape 4)          | 5 (ou 4)   | Exécutés en parallèle ; Agent 5 ignoré en mode cross-repo |
| Vérification par lot (Étape 5)     | 1          | Un seul agent vérifie tous les résultats simultanément          |
| Audit inverse (Étape 6)          | 1          | Détecte les angles morts ; les résultats ignorent la vérification     |
| **Total**                       | **7 ou 6** | Même dépôt : 7 ; cross-repo : 6 (pas d'Agent 5)            |

## Ce qui n'est PAS signalé

La revue exclut intentionnellement :

- Les problèmes préexistants dans le code non modifié (focus sur le diff uniquement)
- Le style/formatage/nommage qui correspond aux conventions de votre codebase
- Les problèmes qu'un linter ou un type checker détecterait (gérés par l'analyse déterministe)
- Les suggestions subjectives "envisagez de faire X" sans problème réel
- Le refactoring mineur qui ne corrige pas un bug ou un risque
- La documentation manquante, sauf si la logique est réellement confuse
- Les problèmes déjà discutés dans les commentaires PR existants (évite de dupliquer les retours humains)

## Philosophie de conception

> **Le silence vaut mieux que le bruit.** Chaque commentaire doit valoir le temps du lecteur.

- Si vous n'êtes pas sûr qu'il s'agisse d'un problème → ne le signalez pas
- Les problèmes linter/typecheck sont gérés par des outils, pas par des suppositions LLM
- Même pattern sur N fichiers → agrégé en un seul résultat
- Les commentaires PR sont à haute confiance uniquement
- Les problèmes de style/formatage correspondant aux conventions de la codebase sont exclus