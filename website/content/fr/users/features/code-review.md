# Revue de code

> Évaluez les modifications de code pour vérifier leur exactitude, leur sécurité, leurs performances et leur qualité en utilisant `/review`.

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

S'il n'y a pas de modifications non commitées, `/review` vous en informera et s'arrêtera — aucun agent n'est lancé.

## Fonctionnement

La commande `/review` exécute un pipeline en plusieurs étapes :

```
Étape 1 : Déterminer la portée (diff local / worktree de la PR / fichier)
Étape 2 : Charger les règles de revue du projet
Étape 3 : 9 agents de revue en parallèle                          [9 appels LLM]
           |-- Agent 1 : Exactitude
           |-- Agent 2 : Sécurité
           |-- Agent 3 : Qualité du code
           |-- Agent 4 : Performances et efficacité
           |-- Agent 5 : Couverture des tests
           |-- Agent 6 : Audit non dirigé (3 personas : 6a/6b/6c)
           '-- Agent 7 : Build et tests (exécute des commandes shell)
Étape 4 : Dédupliquer --> Vérification par lot --> Agrégation         [1 appel LLM]
Étape 5 : Audit inverse itératif (1 à 3 tours, recherche de lacunes) [1 à 3 appels LLM]
Étape 6 : Présenter les résultats + verdict
Étape 7 : Soumettre la revue de la PR (commentaires inline, si demandé)
Étape 8 : Sauvegarder le rapport + cache incrémental
Étape 9 : Nettoyage (suppression du worktree + fichiers temporaires)
```

### Agents de revue

| Agent                             | Focus                                                                                       |
| --------------------------------- | ------------------------------------------------------------------------------------------- |
| Agent 1 : Exactitude              | Erreurs de logique, cas limites, gestion des null, conditions de course, sécurité des types |
| Agent 2 : Sécurité                | Injections, XSS, SSRF, contournement d'authentification, exposition de données sensibles    |
| Agent 3 : Qualité du code         | Cohérence du style, nommage, duplication, code mort                                         |
| Agent 4 : Performances et efficacité | Requêtes N+1, fuites de mémoire, re-rendus inutiles, taille du bundle                    |
| Agent 5 : Couverture des tests    | Chemins de code non testés dans le diff, couverture de branches manquante, assertions faibles |
| Agent 6 : Audit non dirigé        | 3 personas en parallèle (attaquant / oncall de 3h du matin / mainteneur) — détecte les problèmes transversaux |
| Agent 7 : Build et tests          | Exécute les commandes de build et de test, signale les échecs                               |

Tous les agents s'exécutent en parallèle (l'agent 6 lance 3 variantes de personas simultanément, ce qui porte le total à 9 tâches parallèles pour les revues dans le même dépôt). Les résultats des agents 1 à 6 sont vérifiés en **une seule passe de vérification par lot** (un seul agent examine tous les résultats en même temps, ce qui maintient le coût de vérification fixe quel que soit le nombre de résultats). Après vérification, un **audit inverse itératif** exécute 1 à 3 tours de recherche de lacunes — chaque tour reçoit la liste cumulative des résultats des tours précédents, de sorte que les tours successifs se concentrent sur ce qui reste à découvrir. La boucle s'arrête dès qu'un tour retourne "Aucun problème trouvé", ou après 3 tours (limite stricte). Les résultats de l'audit inverse sautent la vérification (l'agent a déjà le contexte complet) et sont inclus comme des résultats à haute confiance.

## Niveaux de sévérité

| Severity         | Meaning                                                             | Posted as PR comment?      |
| ---------------- | ------------------------------------------------------------------- | -------------------------- |
| **Critique**     | Doit être corrigé avant la fusion (bugs, sécurité, perte de données, échecs de build) | Oui (haute confiance uniquement) |
| **Suggestion**   | Amélioration recommandée                                            | Oui (haute confiance uniquement) |
| **Nice to have** | Optimisation optionnelle                                            | Non (terminal uniquement)  |

Les résultats à faible confiance apparaissent dans une section distincte "Nécessite une revue humaine" dans le terminal et ne sont jamais publiés en tant que commentaires de PR.

## Isolation du worktree

Lors de la revue d'une PR, `/review` crée un worktree git temporaire (`.qwen/tmp/review-pr-<number>`) au lieu de changer votre branche actuelle. Cela signifie que :

- Votre working tree, les modifications indexées et votre branche actuelle ne sont **jamais modifiés**
- Les dépendances sont installées dans le worktree (`npm ci`, etc.) pour que le build et les tests fonctionnent
- Les commandes de build et de test s'exécutent de manière isolée sans polluer votre cache de build local
- Si quelque chose tourne mal, votre environnement n'est pas affecté — supprimez simplement le worktree
- Le worktree est automatiquement nettoyé à la fin de la revue
- Si une revue est interrompue (Ctrl+C, crash), la prochaine `/review` de la même PR nettoie automatiquement le worktree obsolète avant de recommencer
- Les rapports de revue et le cache sont sauvegardés dans le répertoire principal du projet (pas dans le worktree)

## Revue de PR inter-dépôts

Vous pouvez revoir les PR d'autres dépôts en passant l'URL complète :

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Cela s'exécute en **mode léger** — pas de worktree, pas de build/test. La revue est basée uniquement sur le texte du diff (récupéré via l'API GitHub). Les commentaires de PR peuvent toujours être publiés si vous avez un accès en écriture.

| Capability                                                 | Same-repo | Cross-repo                    |
| ---------------------------------------------------------- | --------- | ----------------------------- |
| Revue LLM (Agents 1-6 + vérification + audit inverse itératif) | ✅        | ✅                            |
| Agent 7 : Build et tests                                   | ✅        | ❌ (pas de codebase local)    |
| Analyse d'impact inter-fichiers                            | ✅        | ❌                            |
| Commentaires inline de la PR                               | ✅        | ✅ (si vous avez un accès en écriture) |
| Cache de revue incrémental                                 | ✅        | ❌                            |

## Commentaires inline de la PR

Utilisez `--comment` pour publier les résultats directement sur la PR :

```bash
/review 123 --comment
```

Ou, après avoir exécuté `/review 123`, tapez `post comments` pour publier les résultats sans relancer la revue.

**Ce qui est publié :**

- Les résultats Critiques et Suggestions à haute confiance en tant que commentaires inline sur des lignes spécifiques
- Pour les verdicts Approuver / Demander des modifications : un résumé de la revue avec le verdict
- Pour le verdict Commenter avec tous les commentaires inline publiés : pas de résumé séparé (les commentaires inline sont suffisants)
- Pied de page d'attribution du modèle sur chaque commentaire (par ex., _— qwen3-coder via Qwen Code /review_)

**Ce qui reste uniquement dans le terminal :**

- Les résultats Nice to have
- Les résultats à faible confiance

**PR auto-rédigées :** GitHub ne vous permet pas de soumettre des revues `APPROVE` ou `REQUEST_CHANGES` sur votre propre pull request — les deux échouent avec une HTTP 422. Lorsque `/review` détecte que l'auteur de la PR correspond à l'utilisateur authentifié actuel, il rétrograde automatiquement l'événement API en `COMMENT` quel que soit le verdict, afin que la soumission réussisse tout de même. Le terminal affiche toujours le verdict honnête ("Approve" / "Request changes" / "Comment") — seul l'événement de revue côté GitHub est neutralisé. Les résultats réels apparaissent toujours sous forme de commentaires inline sur des lignes spécifiques, les retours substantiels restent donc inchangés.

**Revoir une PR avec des commentaires Qwen Code précédents :** lorsque `/review` s'exécute sur une PR qui possède déjà des commentaires de revue Qwen Code précédents, il les classe avant d'en publier de nouveaux. Seul le **chevauchement sur la même ligne** (un commentaire existant sur le même `(path, line)` qu'un nouveau résultat) vous invite à confirmer — c'est le cas où vous verriez un doublon visuel sur la même ligne de code. Les commentaires des anciens commits, les commentaires ayant reçu une réponse (considérés comme résolus) et les commentaires qui ne chevauchent simplement aucun nouveau résultat sont ignorés silencieusement, avec une ligne de log dans le terminal pour vous indiquer ce qui a été filtré.

**Vérification du statut CI / build avant APPROVE :** si le verdict est "Approve", `/review` interroge les check-runs et les statuts de commit de la PR avant de soumettre. Si une vérification a échoué (ou si toutes les vérifications sont encore en attente), l'événement API est automatiquement rétrogradé de `APPROVE` à `COMMENT`, le corps de la revue expliquant pourquoi. Raison : la revue LLM lit le code de manière statique et ne peut pas voir les échecs de tests à l'exécution ; approuver alors que la CI est rouge serait trompeur. Les résultats inline sont toujours publiés sans changement. Si vous souhaitez approuver quand même (par ex., un échec CI connu comme instable), soumettez l'approbation GitHub manuellement après vérification.

## Actions de suivi

Après la revue, des conseils contextuels apparaissent sous forme de texte fantôme. Appuyez sur Tab pour accepter :

| State after review                 | Tip                | What happens                            |
| ---------------------------------- | ------------------ | --------------------------------------- |
| Revue locale avec des résultats non corrigés | `fix these issues` | Le LLM corrige interactivement chaque résultat    |
| Revue de PR avec des résultats            | `post comments`    | Publie les commentaires inline de la PR (sans revoir) |
| Revue de PR, zéro résultat           | `post comments`    | Approuve la PR sur GitHub (LGTM)        |
| Revue locale, tout est clair            | `commit`           | Commit vos modifications                    |

Remarque : `fix these issues` n'est disponible que pour les revues locales. Pour les revues de PR, le worktree est nettoyé après la revue, il n'est donc pas possible de corriger de manière interactive après la revue — utilisez `--comment` ou `post comments` pour publier les résultats à la place.

## Règles de revue du projet

Vous pouvez personnaliser les critères de revue par projet. `/review` lit les règles depuis ces fichiers (dans l'ordre) :

1. `.qwen/review-rules.md` (Qwen Code natif)
2. `.github/copilot-instructions.md` (préféré) ou `copilot-instructions.md` (fallback — un seul est chargé, pas les deux)
3. `AGENTS.md` — section `## Code Review`
4. `QWEN.md` — section `## Code Review`

Les règles sont injectées dans les agents de revue LLM (1 à 6) en tant que critères supplémentaires. Pour les revues de PR, les règles sont lues depuis la **branche de base** pour empêcher une PR malveillante d'injecter des règles de contournement.

Exemple de `.qwen/review-rules.md` :

```markdown
# Règles de revue

- Tous les endpoints API doivent valider l'authentification
- Les requêtes de base de données doivent utiliser des instructions paramétrées
- Les composants React ne doivent pas utiliser de styles inline
- Les messages d'erreur ne doivent pas exposer de chemins internes
```

## Revue incrémentale

Lors de la revue d'une PR ayant déjà été revue, `/review` examine uniquement les modifications depuis la dernière revue :

```bash
# Première revue — revue complète, cache créé
/review 123

# PR mise à jour avec de nouveaux commits — seules les nouvelles modifications sont revues
/review 123
```

### Revue inter-modèles

Si vous changez de modèle (via `/model`) et revoyez la même PR, `/review` détecte le changement de modèle et exécute une revue complète au lieu de passer :

```bash
# Revue avec le modèle A
/review 123

# Changer de modèle
/model

# Revoir — revue complète avec le modèle B (non ignorée)
/review 123
# → "La revue précédente utilisait qwen3-coder. Exécution d'une revue complète avec gpt-4o pour un second avis."
```

Le cache est stocké dans `.qwen/review-cache/` et suit à la fois le SHA du commit et l'ID du modèle. Assurez-vous que ce répertoire est dans votre `.gitignore` (une règle plus large comme `.qwen/*` fonctionne aussi). Si le commit en cache a été rebasé et a disparu, il revient à une revue complète.

## Rapports de revue

Pour les revues dans le même dépôt, les résultats sont sauvegardés sous forme de fichier Markdown dans le répertoire `.qwen/reviews/` de votre projet (les revues légères inter-dépôts ignorent la persistance du rapport) :

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Les rapports incluent : l'horodatage, les statistiques du diff, les résultats de build/test, tous les résultats avec leur statut de vérification, et le verdict.

## Analyse d'impact inter-fichiers

Lorsque les modifications de code altèrent des fonctions, classes ou interfaces exportées, les agents de revue recherchent automatiquement tous les appelants et vérifient la compatibilité :

- Modifications du nombre/type de paramètres
- Modifications du type de retour
- Méthodes publiques supprimées ou renommées
- Breaking changes d'API

Pour les diffs importants (>10 symboles modifiés), l'analyse priorise les fonctions avec des changements de signature.

## Efficacité des tokens

Le pipeline de revue utilise un nombre borné d'appels LLM, quel que soit le nombre de résultats produits :

| Stage                            | LLM calls         | Notes                                               |
| -------------------------------- | ----------------- | --------------------------------------------------- |
| Agents de revue (Étape 3)           | 9 (ou 8)          | S'exécutent en parallèle ; Agent 7 ignoré en mode inter-dépôts |
| Vérification par lot (Étape 4)      | 1                 | Un seul agent vérifie tous les résultats en même temps          |
| Audit inverse itératif (Étape 5) | 1-3               | Boucle jusqu'à "Aucun problème trouvé" ou la limite de 3 tours        |
| **Total**                        | **11-13 (10-12)** | Même dépôt : 11-13 ; inter-dépôts : 10-12 (sans l'Agent 7)    |

La plupart des PR convergent vers la limite inférieure de la fourchette (1 tour d'audit inverse) ; la limite empêche les coûts incontrôlés dans les cas pathologiques.

## Ce qui N'EST PAS signalé

La revue exclut intentionnellement :

- Les problèmes préexistants dans le code non modifié (concentration sur le diff uniquement)
- Le style ou le formatage qu'un formateur normaliserait automatiquement, ou le nommage respectant les conventions de votre codebase — mais PAS les problèmes substantiels qu'un linter ou un type checker signalerait (variables inutilisées, code inatteignable, erreurs de type), qui sont dans le périmètre
- Les suggestions subjectives de type "envisagez de faire X" sans problème réel
- Le refactoring mineur qui ne corrige pas un bug ou un risque
- La documentation manquante sauf si la logique est vraiment confuse
- Les problèmes déjà discutés dans les commentaires existants de la PR (évite de dupliquer les retours humains)

## Philosophie de conception

> **Le silence vaut mieux que le bruit.** Chaque commentaire doit mériter le temps du lecteur.

- Si vous n'êtes pas sûr qu'un problème existe → ne le signalez pas
- Le même motif dans N fichiers → agrégé en un seul résultat
- Les commentaires de PR sont à haute confiance uniquement
- Le style/formatage cosmétique respectant les conventions de la codebase est exclu