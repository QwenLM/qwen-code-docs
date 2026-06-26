# Révision de code

> Examinez les modifications de code pour leur exactitude, leur sécurité, leurs performances et leur qualité à l’aide de `/review`.

## Démarrage rapide

```bash
# Revoir les modifications locales non validées
/review

# Revoir une pull request (par numéro ou URL)
/review 123
/review https://github.com/org/repo/pull/123

# Revoir et publier des commentaires en ligne sur la PR
/review 123 --comment

# Revoir un fichier spécifique
/review src/utils/auth.ts
```

S'il n'y a aucune modification non validée, `/review` vous en informe et s'arrête — aucun agent n'est lancé.

## Fonctionnement

La commande `/review` exécute un pipeline en plusieurs étapes :

```
Étape 1  : Déterminer le périmètre (diff local / worktree PR / fichier)
Étape 2  : Charger les règles de révision du projet
Étape 3  : Exécuter les analyses déterministes (linter, vérification de types)    [coût LLM zéro]
Étape 4  : 9 agents de révision en parallèle                                         [9 appels LLM]
           |-- Agent 1 : Exactitude
           |-- Agent 2 : Sécurité
           |-- Agent 3 : Qualité du code
           |-- Agent 4 : Performance et efficacité
           |-- Agent 5 : Couverture de tests
           |-- Agent 6 : Audit non dirigé (3 personas : 6a/6b/6c)
           '-- Agent 7 : Compilation et tests (exécute des commandes shell)
Étape 5  : Déduplication --> Vérification par lot --> Agrégation                 [1 appel LLM]
Étape 6  : Audit inverse itératif (1 à 3 tours, recherche de lacunes)            [1-3 appels LLM]
Étape 7  : Présentation des résultats + verdict
Étape 8  : Correction automatique (confirmée par l'utilisateur, facultative)
Étape 9  : Publier les commentaires en ligne sur la PR (si demandé)
Étape 10 : Sauvegarder le rapport + le cache incrémental
Étape 11 : Nettoyage (supprimer le worktree et les fichiers temporaires)
```

### Agents de révision

| Agent                          | Axe                                                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Agent 1 : Exactitude           | Erreurs logiques, cas limites, gestion de `null`, conditions de concurrence, sécurité des types                       |
| Agent 2 : Sécurité             | Injections, XSS, SSRF, contournement d'authentification, exposition de données sensibles                             |
| Agent 3 : Qualité du code      | Cohérence de style, nommage, duplication, code mort                                                                   |
| Agent 4 : Performance & Efficacité | Requêtes N+1, fuites mémoire, re-rendus inutiles, taille du bundle                                                |
| Agent 5 : Couverture de tests  | Chemins de code non testés dans le diff, couverture de branche manquante, assertions faibles                          |
| Agent 6 : Audit non dirigé     | 3 personas en parallèle (attaquant / on-call de nuit / mainteneur) — détecte les problèmes transversaux               |
| Agent 7 : Compilation & Tests  | Exécute les commandes de build et de test, signale les échecs                                                         |

Tous les agents s'exécutent en parallèle (l'Agent 6 lance 3 variantes de persona simultanément, soit 9 tâches parallèles pour les révisions dans le même dépôt). Les résultats des Agents 1 à 6 sont vérifiés en **une seule passe de vérification par lot** (un agent examine tous les résultats à la fois, ce qui maintient un coût de vérification fixe quel que soit le nombre de résultats). Après vérification, **l'audit inverse itératif** effectue 1 à 3 tours de recherche de lacunes — chaque tour reçoit la liste cumulative des résultats des tours précédents, de sorte que les tours successifs se concentrent sur ce qui reste à découvrir. La boucle s'arrête dès qu'un tour renvoie « Aucun problème trouvé », ou après 3 tours (limite absolue). Les résultats de l'audit inverse sautent la vérification (l'agent dispose déjà du contexte complet) et sont inclus comme résultats de haute confiance.

## Analyse déterministe

Avant l'exécution des agents LLM, `/review` lance automatiquement les linters et vérificateurs de types existants du projet :

| Langage                | Outils détectés                                                      |
| ---------------------- | -------------------------------------------------------------------- |
| TypeScript/JavaScript  | `tsc --noEmit`, `npm run lint`, `eslint`                             |
| Python                 | `ruff`, `mypy`, `flake8`                                             |
| Rust                   | `cargo clippy`                                                       |
| Go                     | `go vet`, `golangci-lint`                                            |
| Java                   | `mvn compile`, `checkstyle`, `spotbugs`, `pmd`                       |
| C/C++                  | `clang-tidy` (si `compile_commands.json` disponible)                 |
| Autre                  | Détecté automatiquement dans la configuration CI (`.github/workflows/*.yml`, etc.) |

Pour les projets qui ne correspondent pas aux modèles standards (ex. OpenJDK), `/review` lit les fichiers de configuration CI pour découvrir les commandes de lint/vérification utilisées par le projet. Aucune configuration utilisateur n'est nécessaire.

Les résultats déterministes sont étiquetés `[linter]` ou `[typecheck]` et sautent la vérification LLM — ils constituent la vérité de référence.

- **Erreurs** → Sévérité critique
- **Avertissements** → Bon à savoir (terminal uniquement, pas publiés comme commentaires de PR)

Si un outil n'est pas installé ou expire, il est ignoré avec une note informative.

## Niveaux de sévérité

| Sévérité        | Signification                                                                 | Publié en commentaire de PR ?    |
| --------------- | ----------------------------------------------------------------------------- | -------------------------------- |
| **Critique**    | Doit être corrigé avant la fusion (bugs, sécurité, perte de données, échecs de build) | Oui (haute confiance uniquement) |
| **Suggestion**  | Amélioration recommandée                                                      | Oui (haute confiance uniquement) |
| **Bon à savoir**| Optimisation facultative                                                      | Non (terminal uniquement)        |

Les résultats de faible confiance apparaissent dans une section séparée « Nécessite une relecture humaine » dans le terminal et ne sont jamais publiés comme commentaires de PR.

## Correction automatique

Après avoir présenté les résultats, `/review` propose d'appliquer automatiquement les corrections pour les problèmes de sévérité Critique et Suggestion qui ont des solutions claires :

```
3 problèmes avec des suggestions auto-réparables trouvés. Appliquer les corrections automatiques ? (o/n)
```

- Les corrections sont appliquées via l'outil `edit` (remplacements ciblés, pas de réécriture complète du fichier)
- Des vérifications de linter par fichier sont exécutées après les corrections pour s'assurer qu'elles n'introduisent pas de nouveaux problèmes
- Pour les révisions de PR, les corrections sont validées et poussées depuis le worktree automatiquement — votre arbre de travail reste propre
- Les résultats « Bon à savoir » et de faible confiance ne sont jamais corrigés automatiquement
- La soumission de la révision de PR utilise toujours le **verdict pré-correction** (ex. « Demander des modifications ») car la PR distante n'est mise à jour qu'après la fin du push de correction automatique

## Isolation par worktree

Lors de la révision d'une PR, `/review` crée un worktree git temporaire (`.qwen/tmp/review-pr-<numéro>`) au lieu de basculer votre branche actuelle. Cela signifie que :

- Votre arbre de travail, vos modifications indexées et votre branche actuelle **ne sont jamais touchés**
- Les dépendances sont installées dans le worktree (`npm ci`, etc.) afin que le linting et le build/test fonctionnent
- Les commandes de build et de test s'exécutent de manière isolée sans polluer votre cache de build local
- Si quelque chose ne va pas, votre environnement n'est pas affecté — il suffit de supprimer le worktree
- Le worktree est automatiquement nettoyé après la fin de la révision
- Si une révision est interrompue (Ctrl+C, crash), la prochaine exécution de `/review` sur la même PR nettoie automatiquement le worktree obsolète avant de recommencer
- Les rapports de révision et le cache sont sauvegardés dans le répertoire principal du projet (pas dans le worktree)

## Révision de PR entre dépôts

Vous pouvez réviser les PR d'autres dépôts en passant l'URL complète :

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Cela s'exécute en **mode léger** — pas de worktree, pas de linter, pas de build/test, pas de correction automatique. La révision est basée uniquement sur le texte du diff (récupéré via l'API GitHub). Les commentaires de PR peuvent toujours être publiés si vous avez les droits d'écriture.

| Capacité                                                               | Même dépôt | Entre dépôts                   |
| ---------------------------------------------------------------------- | ---------- | ------------------------------ |
| Révision LLM (Agents 1-6 + vérification + audit inverse itératif)      | ✅         | ✅                             |
| Agent 7 : Build & test                                                 | ✅         | ❌ (pas de codebase locale)    |
| Analyse déterministe (linter/vérification de types)                    | ✅         | ❌                             |
| Analyse d'impact inter-fichiers                                        | ✅         | ❌                             |
| Correction automatique                                                 | ✅         | ❌                             |
| Commentaires en ligne sur la PR                                        | ✅         | ✅ (si vous avez les droits d'écriture) |
| Cache de révision incrémental                                          | ✅         | ❌                             |

## Commentaires en ligne sur la PR

Utilisez `--comment` pour publier les résultats directement sur la PR :

```bash
/review 123 --comment
```

Ou, après avoir exécuté `/review 123`, tapez `post comments` pour publier les résultats sans relancer la révision.

**Ce qui est publié :**

- Les résultats de haute confiance de sévérité Critique et Suggestion sous forme de commentaires en ligne sur des lignes spécifiques
- Pour les verdicts « Approuver / Demander des modifications » : un résumé de révision avec le verdict
- Pour le verdict « Commenter » avec tous les commentaires en ligne publiés : pas de résumé séparé (les commentaires en ligne suffisent)
- Pied de page d'attribution du modèle sur chaque commentaire (ex. _— qwen3-coder via Qwen Code /review_)

**Ce qui reste dans le terminal uniquement :**

- Les résultats « Bon à savoir » (y compris les avertissements du linter)
- Les résultats de faible confiance

**PR auto-rédigées :** GitHub ne permet pas de soumettre des révisions `APPROVE` ou `REQUEST_CHANGES` sur votre propre pull request — les deux échouent avec une erreur HTTP 422. Lorsque `/review` détecte que l'auteur de la PR correspond à l'utilisateur actuellement authentifié, il rétrograde automatiquement l'événement API en `COMMENT` quel que soit le verdict, afin que la soumission réussisse. Le terminal affiche toujours le verdict honnête (« Approuver » / « Demander des modifications » / « Commenter ») — seul l'événement de révision côté GitHub est neutralisé. Les résultats réels apparaissent toujours sous forme de commentaires en ligne sur des lignes spécifiques, donc les retours substantiels restent inchangés.

**Re-révision d'une PR avec des commentaires Qwen Code antérieurs :** lorsque `/review` s'exécute sur une PR qui contient déjà des commentaires de révision Qwen Code précédents, il les classifie avant d'en poster de nouveaux. Seul un **chevauchement sur la même ligne** (un commentaire existant sur le même `(chemin, ligne)` qu'un nouveau résultat) vous invite à confirmer — c'est le cas où vous verriez un doublon visuel sur la même ligne de code. Les commentaires de commits plus anciens, les commentaires avec réponse (considérés comme résolus) et les commentaires qui ne chevauchent simplement aucun nouveau résultat sont silencieusement ignorés, avec une ligne dans le journal du terminal pour vous informer de ce qui a été filtré.

**Vérification de l'état CI / du build avant APPROVE :** si le verdict est « Approuver », `/review` interroge les exécutions de vérifications et les statuts de commit de la PR avant de soumettre. Si une vérification a échoué (ou si toutes les vérifications sont encore en attente), l'événement API est automatiquement rétrogradé de `APPROVE` à `COMMENT`, avec un corps de révision expliquant pourquoi. Raison : la révision LLM lit le code de manière statique et ne peut pas voir les échecs de test à l'exécution ; approuver alors que la CI est rouge serait trompeur. Les résultats en ligne restent inchangés. Si vous voulez approuver malgré tout (par exemple, un échec CI connu comme instable), soumettez l'approbation GitHub manuellement après vérification.

## Actions de suivi

Après la révision, des conseils contextuels apparaissent sous forme de texte fantôme. Appuyez sur Tab pour accepter :

| État après révision                          | Astuce                | Ce qui se produit                                                       |
| -------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| Révision locale avec résultats non corrigés  | `fix these issues`    | Le LLM corrige chaque résultat de manière interactive                    |
| Révision de PR avec résultats                | `post comments`       | Publie les commentaires en ligne sur la PR (pas de nouvelle révision)    |
| Révision de PR, aucun résultat               | `post comments`       | Approuve la PR sur GitHub (LGTM)                                        |
| Révision locale, tout est clair              | `commit`              | Valide vos modifications                                                |

Remarque : `fix these issues` n'est disponible que pour les révisions locales. Pour les révisions de PR, utilisez la correction automatique (étape 8) — le worktree est nettoyé après la révision, donc une correction interactive post-révision n'est pas possible.

## Règles de révision du projet

Vous pouvez personnaliser les critères de révision par projet. `/review` lit les règles depuis ces fichiers (dans l'ordre) :

1. `.qwen/review-rules.md` (natif Qwen Code)
2. `.github/copilot-instructions.md` (préféré) ou `copilot-instructions.md` (solution de repli — un seul est chargé, pas les deux)
3. `AGENTS.md` — section `## Code Review`
4. `QWEN.md` — section `## Code Review`

Les règles sont injectées dans les agents de révision LLM (1 à 6) comme critères supplémentaires. Pour les révisions de PR, les règles sont lues depuis la **branche de base** pour empêcher une PR malveillante d'injecter des règles de contournement.

Exemple de `.qwen/review-rules.md` :

```markdown
# Règles de révision

- Tous les points de terminaison API doivent valider l'authentification
- Les requêtes de base de données doivent utiliser des instructions paramétrées
- Les composants React ne doivent pas utiliser de styles en ligne
- Les messages d'erreur ne doivent pas exposer de chemins internes
```

## Révision incrémentale

Lors de la révision d'une PR déjà examinée précédemment, `/review` n'examine que les modifications depuis la dernière révision :

```bash
# Première révision — révision complète, cache créé
/review 123

# PR mise à jour avec de nouveaux commits — seules les nouvelles modifications sont révisées
/review 123
```

### Révision inter-modèles

Si vous changez de modèle (via `/model`) et réexaminez la même PR, `/review` détecte le changement de modèle et effectue une révision complète au lieu de l'ignorer :

```bash
# Révision avec le modèle A
/review 123

# Changer de modèle
/model

# Réexaminer — révision complète avec le modèle B (pas ignorée)
/review 123
# → "La révision précédente utilisait qwen3-coder. Révision complète avec gpt-4o pour un second avis."
```

Le cache est stocké dans `.qwen/review-cache/` et suit à la fois le SHA du commit et l'ID du modèle. Assurez-vous que ce répertoire est dans votre `.gitignore` (une règle plus large comme `.qwen/*` fonctionne aussi). Si le commit mis en cache a été rebasé, une révision complète est effectuée par repli.

## Rapports de révision

Pour les révisions dans le même dépôt, les résultats sont sauvegardés sous forme de fichier Markdown dans le répertoire `.qwen/reviews/` du projet (les révisions légères entre dépôts ignorent la persistance du rapport) :

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Les rapports incluent : l'horodatage, les statistiques de diff, les résultats de l'analyse déterministe, tous les résultats avec leur statut de vérification, et le verdict.

## Analyse d'impact inter-fichiers

Lorsque les modifications de code affectent des fonctions, classes ou interfaces exportées, les agents de révision recherchent automatiquement tous les appelants et vérifient la compatibilité :

- Modifications du nombre/type de paramètres
- Modifications du type de retour
- Méthodes publiques supprimées ou renommées
- Changements d'API incompatibles

Pour les gros diffs (>10 symboles modifiés), l'analyse se concentre sur les fonctions dont la signature change.

## Efficacité du jeton (token)

Le pipeline de révision utilise un nombre borné d'appels LLM, quel que soit le nombre de résultats produits :

| Étape                               | Appels LLM    | Notes                                                     |
| ----------------------------------- | ------------- | --------------------------------------------------------- |
| Analyse déterministe (étape 3)      | 0             | Commandes shell uniquement                                 |
| Agents de révision (étape 4)        | 9 (ou 8)      | Exécutés en parallèle ; Agent 7 ignoré en mode inter-dépôt |
| Vérification par lot (étape 5)      | 1             | Un seul agent vérifie tous les résultats à la fois         |
| Audit inverse itératif (étape 6)    | 1-3           | Boucle jusqu'à « Aucun problème trouvé » ou limite de 3 tours |
| **Total**                           | **11-13 (10-12)** | Même dépôt : 11-13 ; inter-dépôt : 10-12 (pas d'Agent 7) |

La plupart des PR convergent vers la borne inférieure de la plage (1 tour d'audit inverse) ; la limite empêche une explosion des coûts sur les cas pathologiques.

## Ce qui N'EST PAS signalé

La révision exclut intentionnellement :

- Les problèmes préexistants dans le code non modifié (concentrez-vous uniquement sur le diff)
- Les problèmes de style/formatage/nommage qui correspondent aux conventions de votre codebase
- Les problèmes qu'un linter ou un vérificateur de types détecterait (traités par l'analyse déterministe)
- Les suggestions subjectives du type « envisagez de faire X » sans problème réel
- Les refontes mineures qui ne corrigent ni bug ni risque
- Le manque de documentation sauf si la logique est vraiment déroutante
- Les problèmes déjà discutés dans les commentaires de PR existants (évite de dupliquer les retours humains)

## Philosophie de conception

> **Mieux vaut le silence que le bruit.** Chaque commentaire devrait mériter le temps de lecture de son destinataire.

- Si vous n'êtes pas sûr que quelque chose soit un problème → ne signalez pas.
- Les problèmes de linter/vérification de types sont gérés par les outils, pas par des conjectures LLM.
- Même motif sur N fichiers → regroupé en un seul résultat.
- Les commentaires de PR sont réservés aux résultats de haute confiance.
- Les problèmes de style/formatage conformes aux conventions de la codebase sont exclus.