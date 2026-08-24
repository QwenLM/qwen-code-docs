---
title: "Revue de code"
description: "Évaluez les modifications de code pour la correction, la sécurité, les performances et la qualité du code en utilisant /review."
---

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

# Revoir les modifications locales et appliquer les résultats à votre working tree
/review --fix

# Reprendre une revue de la même PR qui a été interrompue, au lieu de recommencer
/review 123 --resume

# Revoir un fichier spécifique
/review src/utils/auth.ts

# Passe rapide non vérifiée (sans sous-agents)
/review --effort low
/review 123 --effort medium
```

S'il n'y a pas de modifications non commitées, `/review` vous en informera et s'arrêtera — aucun agent n'est lancé.

## Niveaux d'effort

`--effort low|medium|high` échange la profondeur contre la vitesse :

| Niveau   | Ce qui s'exécute                                                                                                                                                                                       | Limite de résultats            | Verdict                               | Publie sur la PR |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------- | ---------------- |
| `low`    | 3 à 6 angles inline dirigés sur le diff (ajustés à la taille du diff) plus un balayage de lacunes — pas de sous-agents, pas de build/test, pas de règles de projet                                    | 10 (non vérifiés)              | Aucun                                 | Jamais           |
| `medium` | Le pipeline high minus ses passes les plus coûteuses : le fan-out parallèle de détecteurs sur un ensemble de dimensions réduit, plus le build/test et une seule passe de vérification                  | Illimité (vérifiés)            | Approve plafonné à Comment            | Jamais           |
| `high`   | Pipeline complet : jusqu'à 16 agents parallèles → vérification fragmentée → audit inverse itératif                                                                                                     | Illimité (vérifiés)            | Approve / Request changes / Comment   | Avec `--comment` |

Par défaut : **high** pour les revues de PR, **medium** pour les revues locales et de fichiers. Un `--comment` effectif force le niveau high (les commentaires publiés doivent survivre à la vérification) — sur une cible non-PR, `--comment` est ignoré avec un avertissement et ne modifie **pas** le niveau d'effort. Medium conserve les agents de sécurité et de couverture de tests ainsi que le build/test, et abandonne les personas adversariaux, les spécialistes des pièges linguistiques et du routage de wrappers/proxies (Agents 1d/1e), les détecteurs spécialisés dans les diffs et l'audit inverse — ainsi un Critical subtil que seul un second regard aurait révélé peut passer inaperçu ; utilisez `--effort high` pour les revues sensibles à la sécurité ou en pré-production. Seul `low` est non vérifié. L'isolation du worktree s'applique aux revues de PR dans le même dépôt ; les PR inter-dépôts s'exécutent en mode léger (diff uniquement, pas de worktree ni de build/test). La passe low est étiquetée non vérifiée, n'émet aucun verdict, et n'écrit jamais le cache de revue incrémental, de sorte qu'une exécution ultérieure avec `--effort high` n'est jamais ignorée comme « déjà revue » ; medium est vérifié mais son Approve est plafonné à Comment, car rien n'a examiné deux fois ce que la première passe a manqué. Les mécanismes d'obtention du diff sont identiques à chaque niveau — les revues de PR utilisent toujours le worktree isolé et la même résolution de base, de sorte que la revue ne porte jamais sur la mauvaise base. Une différence de portée subsiste : le cache incrémental est exclusif au niveau high, donc une re-revue high peut ne couvrir que les nouveaux commits (`lastCommitSha..HEAD`) tandis que low/medium revoient toujours le diff complet de la PR.

## Fonctionnement

La commande `/review` exécute un pipeline en plusieurs étapes :

```
Étape 1 :  Déterminer la portée + le niveau d'effort (diff local / worktree PR / fichier)
           Capturer le diff dans un fichier + le partitionner en chunks
Étape 2 :  Charger les règles de revue du projet (medium/high)
Étape 3C : effort low : 3-6 angles inline + balayage de lacunes   [0 appels de sous-agents]
Étape 3A : high, <=500 src ET <=3200 total : jusqu'à 16 agents  [16+ appels LLM]
           |-- Agent 0 : Fidélité aux issues et responsabilité de la cause racine
           |-- Agent 1a : Correction — analyse ligne par ligne
           |-- Agent 1b : Correction — audit du comportement supprimé
           |-- Agent 1c : Correction — traceur inter-fichiers
           |-- Agent 1d : Correction — analyse des pièges linguistiques
           |-- Agent 1e : Correction — routage de wrappers/proxies
           |     (uniquement quand le diff signale un type enveloppant)
           |-- Agent 2 : Sécurité
           |-- Agent 3a : Réutilisation et duplication
           |-- Agent 3b : Altitude et adéquation de l'abstraction
           |-- Agent 3c : Cohérence et clarté
           |-- Agent 4 : Performances et efficacité
           |-- Agent 5 : Couverture des tests
           |-- Agent 6 : Audit non dirigé (3 personas : 6a/6b/6c)
           |-- Agent 8 : Détecteurs spécialisés dans les diffs (0-2, uniquement
           |     quand le domaine du diff les appelle)
           '-- Agent 7 : Build et tests (exécute des commandes shell)
Étape 3B : high, >500 src OU >3200 total : territoire × dim.        [N+5..7+3H appels]
           (N chunks, 5-7 agents sur l'ensemble du diff, 3 agents
            d'invariants par fichier lourd H)
           |-- 1 agent par chunk pour ~400 lignes de diff (toutes les dimensions,
           |     son territoire uniquement, retourne un reçu de couverture)
           |-- 3 agents d'invariants par fichier source fortement
           |     réécrit (fichier entier ; state/timers, counters/
           |      returns/errors, config/early-returns)
           |-- Agent 0 : Fidélité aux issues      (diff entier)
           |-- Agent 7 : Build et tests           (repo entier)
           |-- Agent 1b : Comportement supprimé   (diff entier — la moitié
           |     inter-chunks ; les chunks gardent la moitié locale)
           |-- Agent 1c : Traceur inter-fichiers  (diff entier)
           |-- Agent 8 : Détecteurs spécialisés   (diff entier, 0-2)
           '-- Matrice de couverture des tests    (diff entier)
Étape 4 :  Dédupliquer --> Vérification fragmentée (<=8 résultats chacune)
           --> Agréger                              [ceil(F/8) appels, F=résultats]
Étape 5 :  Audit inverse itératif, réparti par chunk ;
           arrêt après 2 tours consécutifs sans résultat (limite 10/5/3 selon la topologie)
Étape 6 :  Présenter les résultats + verdict (high ; passe low : résultats uniquement)
           Canonicaliser les résultats -> .qwen/tmp/...-findings.json
Étape 6B : Appliquer les résultats + enregistrer les résultats par résultat  (--fix uniquement)
Étape 7 :  Soumettre la revue de la PR (commentaires inline, si demandé ; high uniquement)
Étape 8 :  Sauvegarder le rapport + cache incrémental (cache : high uniquement)
Étape 9 :  Nettoyage (suppression du worktree + fichiers temporaires)
```

Les étapes 3A/3B/4/5 constituent le pipeline à effort élevé ; avec `--effort low|medium`, une seule passe inline (Étape 3C) les remplace.

### Agents de revue

| Agent                             | Focus                                                                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent 0 : Fidélité aux issues     | Preuves des issues liées, responsabilité de la cause racine, et vérification que la PR résout le problème signalé                                                                                                                                                                             |
| Agent 1a : Analyse ligne par ligne | Parcourt chaque hunk plus sa fonction englobante : conditions incorrectes, décalage d'un, `await` manquant, cas limites, conditions de concurrence                                                                                                                                              |
| Agent 1b : Audit du comportement supprimé | Parcourt chaque ligne supprimée/remplacée : nomme l'invariant qu'elle imposait et cherche où le nouveau code le rétablit — y compris les **exports** supprimés, dont le remplacement vit souvent dans un autre fichier et a changé silencieusement un comportement par défaut. En 3B, il s'exécute sur l'ensemble du diff (les agents de chunks gardent la moitié locale) |
| Agent 1c : Traceur inter-fichiers | Parcourt les appelants de chaque symbole modifié (direction consommateur) et les sites de lecture de chaque champ ajouté (direction producteur), plus les modifications des appelés dans la même PR                                                                                            |
| Agent 1d : Analyse des pièges linguistiques | Porte la checklist des pièges classiques du langage du diff (coercition `==`, pièges des valeurs falsy, capture de variables de boucle, défauts mutables, écritures dans des maps nil, concaténation SQL, arithmétique DST) et fait correspondre chaque hunk par motif avec celle-ci     |
| Agent 1e : Routage de wrappers/proxies | Pour chaque type que le diff ajoute ou modifie et qui en enveloppe un autre (cache, proxy, décorateur, adaptateur) : chaque méthode route à travers l'instance enveloppée, et le wrapper transmet chaque méthode utilisée par les appelants. Inscrit au roster uniquement quand le diff signale un type enveloppant |
| Agent 2 : Sécurité                | Injections, XSS, SSRF, contournement d'authentification, exposition de données sensibles                                                                                                                                                                                                      |
| Agent 3a : Réutilisation et duplication | Le codebase a-t-il déjà cela ? Recherche le comportement, nomme le helper existant à appeler à la place, et signale le code mort laissé par le diff                                                                                                                                              |
| Agent 3b : Altitude et abstraction | La correction est-elle au bon niveau — ou un pansement sur une infrastructure partagée, une compensation en aval pour un bug en amont, ou une abstraction ne servant qu'un seul site d'appel ?                                                                                                |
| Agent 3c : Cohérence et clarté    | Cohérence entre éléments similaires (une garde qu'un membre d'une famille parallèle a mais que son jumeau n'a pas), dérive des conventions par rapport à un exemple local cité, noms/commentaires trompeurs, complexité inutile                                                              |
| Agent 4 : Performances et efficacité | Requêtes N+1, fuites de mémoire, re-rendus inutiles, taille du bundle                                                                                                                                                                                                                       |
| Agent 5 : Couverture des tests    | Chemins de code non testés dans le diff, couverture de branches manquante, assertions faibles                                                                                                                                                                                                 |
| Agent 6 : Audit non dirigé        | 3 personas en parallèle (attaquant / oncall de 3h du matin / mainteneur) — détecte les problèmes inter-dimensionnels                                                                                                                                                                          |
| Agent 7 : Build et tests          | Exécute les commandes de build et de test, signale les échecs                                                                                                                                                                                                                                  |
| Agent 8 : Détecteurs spécialisés dans les diffs | 0 à 2 détecteurs supplémentaires écrits par revue lorsque le diff se concentre dans un domaine avec des modes de défaillance connus (logique de reconnexion, chargeurs de modules, planificateurs, codecs)                                                                                              |

Les trois agents de Correction sont **procéduraux** : chacun est défini par la façon dont il parcourt le diff (ligne par ligne / lignes supprimées / arêtes inter-fichiers), pas par une taxonomie de bugs — leur couverture est donc complémentaire au lieu de se chevaucher. Deux angles dédiés supplémentaires (1d/1e) extraient la checklist des pièges linguistiques et le routage des wrappers/proxies du parcours ligne par ligne : un motif de checklist et une attente structurelle de routage sont des modes d'attention différents, et intégrés au parcours ils étaient dilués par son rythme. Le même raisonnement divise **la qualité du code en trois** (3a/3b/3c) : un agent tenant une checklist de six éléments termine un élément — mesuré sur un fichier fortement réécrit, un agent tenant une checklist de huit éléments a trouvé 1 défaut sur 5 et le même modèle divisé en trois a trouvé les 5 — la checklist qualité est donc découpée là où les questions diffèrent réellement. Tous les agents s'exécutent en parallèle (l'Agent 1 lance 3 variantes procédurales et 2 angles dédiés, l'Agent 3 lance 3 tranches de checklist, et l'Agent 6 lance 3 variantes de personas simultanément, totalisant jusqu'à 16 tâches parallèles pour les revues de PR dans le même dépôt — l'Agent 1e ne s'exécute que lorsque le diff signale un type enveloppant — plus 0 à 2 détecteurs Agent 8 quand le domaine du diff les appelle, soit 15 à 18 en pratique ; l'Agent 0 est ignoré pour les revues de diff local et de chemin de fichier, qui en exécutent 14 à 17 ; le mode léger inter-repos ignore également les Agents 1c et 7, exécutant 13 à 16).

Chaque résultat doit énoncer un **scénario de défaillance** — l'entrée, l'état ou le timing concret qui le déclenche et le résultat erroné qui en découle (pour les résultats de qualité, le coût concret à la place). Un résultat qui ne peut pas nommer son scénario est supprimé à la source, et la vérification retrace le scénario revendiqué à travers le code réel plutôt que de juger la prose du résultat.

Une fois qu'une PR dépasse 500 lignes de modifications **source** — ou plus de 3 200 lignes de diff au total, seuil au-delà duquel les quinze lecteurs de l'ensemble du diff sont chacun trop dilués pour lire attentivement (une limite d'attention, pas une promesse de moins d'appels — les fichiers lourds et les détecteurs spécialisés peuvent faire coûter plus cher la 3B) — ce fan-out par dimension est remplacé par un fan-out **territoire × dimension** : le diff est découpé en chunks d'environ 400 lignes — les limites tombent sur les limites de hunk, et un hunk trop grand pour tenir est découpé uniquement au niveau d'une déclaration de premier niveau, jamais à l'intérieur d'une fonction — et chaque chunk reçoit son propre agent qui applique chaque dimension de revue à ce chunk uniquement.

La porte compte délibérément les lignes source plutôt que les lignes de diff. Le code de test, la prose et les lockfiles dominent la taille du diff — sur les 40 dernières PR fusionnées de ce dépôt, le diff médian est composé à 41 % de tests — donc une porte sur la taille brute découperait un changement de production de 173 lignes en territoires simplement parce qu'il a livré 489 lignes de nouveaux tests, laissant ce code de production avec un seul relecteur au lieu de quatorze lentilles (les agents de dimension de lecture de diff — seize moins Fidélité aux issues et Build et tests). Le chunking couvre toujours chaque ligne de toute façon, tests inclus ; ce que la porte décide c'est combien de relecteurs il y a et ce qu'on leur demande. Quatorze lentilles de lecture de diff parcourant toutes un seul grand diff relisent les mêmes premiers hunks quatorze fois ; un agent par chunk signifie que chaque ligne du diff a exactement un relecteur responsable. Chaque agent de chunk retourne un reçu `Covered:`, et un chunk sans reçu est relu avant que l'exécution ne proceed — ainsi « pas de bloqueurs » ne peut jamais être rapporté pour du code que personne n'a lu.

Un fichier **source** largement réécrit (un fichier existant de 300+ lignes qui est maintenant composé à 40 %+ de nouveau code, ou a 800+ lignes modifiées) reçoit également **trois agents d'invariants sur le fichier entier**. Les fichiers de test et générés ne qualifient jamais — la checklist porte sur des champs, des timers et des taxonomies d'erreurs, ce qu'un fichier de test réécrit n'a pas. Ses bugs ne se trouvent généralement pas à l'intérieur d'un seul hunk mais _entre_ les nouvelles lignes — un timer armé près du haut du fichier et un chemin de teardown deux mille lignes plus bas. Chaque agent lit le fichier entier post-modification et parcourt deux ou trois éléments d'une checklist fixe : les champs mutables effacés sur chaque chemin de sortie, les timers annulés sur chaque fermeture (et l'annulation ne rejetant pas les données capturées), les insertions de map correspondant à des suppressions, les compteurs de retry incrémentés à chaque entrée, les valeurs de retour de statut réellement vérifiées, les codes d'erreur classifiés de manière exhaustive en permanents vs transitoires, les champs de config honorés sur chaque chemin, et les retours anticipés qui sautent un effet de bord requis.

La checklist est divisée en trois intentionnellement. Confier à un agent les huit vérifications sur un fichier de 2 400 lignes n'en fait correctement qu'une ; trois agents avec deux ou trois vérifications chacun les font toutes. Les agents de chunk ne se substituent pas à cela — sur la PR #6457, ils détenaient chacun de ces défauts dans leur territoire assigné et n'en ont signalé aucun. Ce qui leur manquait n'était pas les lignes mais la question.

Les résultats sont vérifiés par **lots fragmentés** (au plus 8 résultats par agent de vérification, tous lancés ensemble). Un vérificateur ne peut rejeter un Critical qu'en citant le code qui le contredit (ou lorsque les propres commentaires du diff documentent le comportement signalé comme délibéré) ; tout ce qui est moins certain est rétrogradé en faible confiance plutôt que supprimé — un Critical silencieusement rejeté est invisible pour chaque étape ultérieure, tandis qu'un rétrogradé atteint toujours un humain. La barre s'applique à la forme de chaque rejet : il doit être constructible à partir du code — citez la ligne que le résultat lit de travers, prouvez l'état revendiqué impossible à partir d'un type, d'une constante ou d'un invariant, citez la garde dans le diff qui couvre le déclencheur, ou faites correspondre un changement de style pur sans effet observable — ou sinon correspondez à un critère d'exclusion, et « trop spéculatif » n'en fait jamais partie. Un résultat dont le scénario de défaillance nomme un état que le code n'exclut pas est plausible par défaut : une course de concurrence, nil/undefined sur un chemin rare mais accessible, un zéro falsy ou une collection vide traité comme manquant, un décalage d'un sur une limite non exclue, une tempête de retry ou une défaillance partielle, une regex ou une allowlist qui a perdu un ancrage. Un rejet qui ne construit aucun des quatre motifs est rétrogradé au lieu d'être supprimé. Après vérification, un **audit inverse itératif** recherche les lacunes, réparti par chunk par tour, chacun ayant la liste cumulative des résultats. La boucle s'arrête après **deux tours consécutifs sans résultat** (ou au plafond de tours du plan — rapporté comme tel plutôt que comme convergence). Ce plafond suit la topologie du diff : **10** sur un petit diff, où un tour est un seul auditeur ; **5** sur un diff découpé en chunks, où c'est un auditeur par chunk ; et **3** sur un énorme diff (≥ 3000 lignes effectives) _lorsque l'exécution a une deadline_, car cinq tours de ~90 minutes ne tiennent pas dans un plafond CI de six heures et une revue interrompue en plein vol ne publie rien — sans deadline, un énorme diff conserve le plafond de 5 du mode chunked. Un opérateur peut abaisser le plafond applicable pour chaque revue avec le paramètre `review.reverseAuditRounds` ; il ne peut jamais l'augmenter. Un tour sans résultat n'est pas une preuve de convergence, et les résultats de l'audit inverse sont vérifiés comme tous les autres.

## Niveaux de sévérité

| Sévérité         | Signification                                                       | Publié en commentaire de PR ?      |
| ---------------- | ------------------------------------------------------------------- | ---------------------------------- |
| **Critique**     | Doit être corrigé avant le merge (bugs, sécurité, perte de données, échecs de build) | Oui (haute confiance uniquement) |
| **Suggestion**   | Amélioration recommandée                                            | Oui (haute confiance uniquement) |
| **Nice to have** | Optimisation optionnelle                                            | Non (terminal uniquement)         |

Les résultats à faible confiance apparaissent dans une section distincte "Needs Human Review" dans le terminal et ne sont jamais publiés en tant que commentaires de PR.

## Isolation du worktree

Lors de la revue d'une PR, `/review` crée un worktree git temporaire (`.qwen/tmp/review-pr-<number>`) au lieu de changer votre branche actuelle. Cela signifie que :

- Votre working tree, les modifications indexées et votre branche actuelle ne sont **jamais modifiés**
- Les dépendances sont installées dans le worktree (`npm ci`, etc.) pour que le build et les tests fonctionnent
- Les commandes de build et de test s'exécutent en isolation sans polluer votre cache de build local
- Si quelque chose tourne mal, votre environnement n'est pas affecté — supprimez simplement le worktree
- Le worktree est automatiquement nettoyé après la fin de la revue
- Si une revue est interrompue (Ctrl+C, crash), la prochaine `/review` de la même PR nettoie automatiquement le worktree obsolète avant de recommencer à zéro. Si la session interrompue laisse encore son bail derrière elle — un kill brutal qui saute cette étape, ou une revue multi-prompt interrompue pendant un prompt ultérieur — `/review` refuse et nomme le fichier de bail à supprimer. Les arrêts propres le libèrent : une revue terminée et les arrêts précoces (diff vide, pas de nouvelles modifications depuis la dernière revue) exécutent tous `cleanup`, qui libère le bail
- Le worktree est sous bail à sa session : une seconde `/review` d'une PR déjà en cours de revue refuse de démarrer (en nommant le détenteur) plutôt que de démonter le worktree de la revue en cours
- Les rapports de revue et le cache sont sauvegardés dans le répertoire principal du projet (pas dans le worktree)
- Les étapes qui **modifient** du code pour mesurer quelque chose — les mutants de la sonde d'efficacité des tests, et la sonde d'un résultat spécifique par un vérificateur — s'exécutent chacune dans leur propre worktree jetable à côté (`…-probe`, `…-scratch-<agent>`), de sorte que l'expérience d'un agent n'est pas visible par les autres qui lisent l'arbre partagé. En dernier recours, chaque agent de chaque vague reçoit également l'information des chemins (s'il y en a) qui diffèrent du commit en cours de revue au moment où il a été lancé, et qu'un échec confiné à ces chemins n'est pas un résultat. Tous ces arbres sont nettoyés avec le worktree à la fin de la revue.

## Revue de PR inter-repos

Vous pouvez revoir les PR d'autres dépôts en passant l'URL complète :

```bash
/review https://github.com/other-org/other-repo/pull/456
```

Cela s'exécute en **mode léger** — pas de worktree, pas de build/test. La revue est basée uniquement sur le texte du diff (récupéré via l'API GitHub). Les commentaires de PR peuvent toujours être publiés si vous avez un accès en écriture.

| Capacité                                                            | Même repo | Inter-repos                      |
| ------------------------------------------------------------------- | --------- | -------------------------------- |
| Revue LLM (Agents 0, 1a, 1b, 1d, 1e, 2-6 + vérification + audit inverse itératif) | ✅        | ✅                               |
| Agent 1c : Traceur inter-fichiers                                   | ✅        | ❌ (pas de base de code locale à explorer) |
| Agent 7 : Build et tests                                            | ✅        | ❌ (pas de base de code locale)  |
| Agent 8 : Détecteurs spécialisés dans les diffs (0-2, quand le domaine les appelle) | ✅        | ✅ (le diff suffit)              |
| Commentaires inline de la PR                                        | ✅        | ✅ (si vous avez un accès en écriture) |
| Cache de revue incrémental                                          | ✅        | ❌                               |

## Commentaires inline de la PR

Utilisez `--comment` pour publier les résultats directement sur la PR :

```bash
/review 123 --comment
```

Ou, après avoir exécuté `/review 123`, tapez `post comments` pour publier les résultats sans relancer la revue.

**Ce qui est publié :**

- Les résultats Critique et Suggestion à haute confiance en tant que commentaires inline sur des lignes spécifiques, chacun préfixé avec `**[Critical]**` ou `**[Suggestion]**` afin que les bloqueurs soient distinguables des recommandations
- Lorsque la correction est une édition localisée unique, un bloc ` ```suggestion ` applicable en un clic
- Pour les verdicts Approve/Request changes : un résumé de la revue avec le verdict
- Pour le verdict Comment avec tous les commentaires inline publiés : pas de résumé séparé (les commentaires inline sont suffisants)
- Pied de page d'attribution du modèle et de la version CLI sur chaque commentaire (par ex., _— qwen3-coder via Qwen Code /review (v0.21.2)_) ; définissez `review.attribution` à `false` dans votre `settings.json` utilisateur ou système (le `.qwen/settings.json` du workspace est ignoré pour les paramètres `review.*`) pour publier sans lui — les commentaires et les listes de corps perdent alors aussi les marqueurs de sévérité `**[Critical]**`/`**[Suggestion]**`, et le modèle est retiré du marqueur de registre machine de la revue, donc dans les environnements frais (pas de cache de revue) l'ancre incrémentale récupérée échoue au check de même modèle et la re-revue revient à la plage complète

**Ce qui reste uniquement dans le terminal :**

- Résultats Nice to have
- Résultats à faible confiance

**PR auto-rédigées :** GitHub ne vous permet pas de soumettre des revues `APPROVE` ou `REQUEST_CHANGES` sur votre propre pull request — les deux échouent avec une HTTP 422. Lorsque `/review` détecte que l'auteur de la PR correspond à l'utilisateur actuellement authentifié, il rétrograde automatiquement l'événement API en `COMMENT` quel que soit le verdict, afin que la soumission réussisse tout de même. Le terminal affiche toujours le verdict honnête ("Approve" / "Request changes" / "Comment") — seul l'événement de revue côté GitHub est neutralisé. Les résultats réels apparaissent toujours sous forme de commentaires inline sur des lignes spécifiques, les retours substantiels restent donc inchangés.

**Re-revue d'une PR avec des commentaires Qwen Code précédents :** lorsque `/review` s'exécute sur une PR qui possède déjà des commentaires de revue Qwen Code précédents, il les classe avant de publier les nouveaux. Seul le **chevauchement sur la même ligne** (un commentaire existant sur le même `(path, line)` qu'un nouveau résultat) vous invite à confirmer — c'est le cas où vous verriez un doublon visuel sur la même ligne de code. Les commentaires des commits plus anciens, les commentaires ayant reçu une réponse (considérés comme résolus), et les commentaires qui ne chevauchent simplement aucun nouveau résultat sont ignorés silencieusement, avec une ligne de log dans le terminal pour que vous sachiez ce qui a été filtré.

**Vérification du statut CI / build avant APPROVE :** si le verdict est "Approve", `/review` interroge les check-runs et les statuts de commit de la PR avant de soumettre. Si une vérification a échoué (ou si toutes les vérifications sont encore en attente), l'événement API est automatiquement rétrogradé de `APPROVE` à `COMMENT`, le corps de la revue expliquant pourquoi. Raison : la revue LLM lit le code de manière statique et ne peut pas voir les échecs de tests à l'exécution ; approuver alors que la CI est au rouge serait trompeur. Les résultats inline sont toujours publiés sans modification. Si vous souhaitez approuver quand même (par ex., un échec CI connu pour être instable), soumettez l'approbation GitHub manuellement après vérification.

## Application des résultats (`--fix`)

`--fix` est le reflet de `--comment`. `--comment` écrit sur une **pull request**, il en faut donc une ; `--fix` écrit sur un **working tree**, il en faut donc un qui survive à la revue :

```bash
/review --fix                 # modifications locales non commitées
/review src/auth.ts --fix     # un seul fichier
```

Sur une **cible PR, il est ignoré avec un avertissement** — une revue de PR s'exécute dans un worktree éphémère supprimé à la fin de la revue, donc les corrections « appliquées » y sont discardées quelques minutes plus tard. Utilisez `--comment` pour publier les résultats à la place.

Un `--fix` effectif **plafonne l'effort à medium**, car il modifie vos fichiers et `low` n'exécute aucune vérification : appliquer un résultat non vérifié est la même erreur que d'en publier un, visant votre working tree plutôt que la PR de quelqu'un d'autre. Il ne force pas `high` — les résultats de medium sont vérifiés, et l'audit inverse que `high` ajoute recherche les résultats _manquants_, ce qui n'est pas ce sur quoi se base la décision d'appliquer ou non un résultat.

Après la revue, chaque résultat est appliqué avec l'outil `edit` puis **comptabilisé**, de trois manières :

| Résultat           | Signification                                         | Reste sur votre plateau ? |
| ------------------ | ----------------------------------------------------- | ------------------------- |
| `fixed`            | L'édition est dans votre tree                         | Non                       |
| `skipped`          | Réel, non appliqué — la raison est rapportée à côté   | Oui                       |
| `no_change_needed` | Le résultat était faux, ou le code le gérait déjà     | Non                       |

Un résultat est ignoré (skipped) lorsque sa correction modifierait le comportement prévu, nécessiterait des changements bien au-delà du diff examiné, ou s'avère être un faux positif après un second regard.

**Chaque résultat obtient un outcome, et c'est imposé plutôt que demandé.** Le registre passe par `qwen review findings --outcomes`, qui refuse un ensemble ne couvrant pas tous les résultats — un fixer qui applique six résultats sur neuf et en rapporte six n'a menti sur aucun d'eux, il a silencieusement raccourci la liste, et vous n'auriez aucun moyen de voir les trois qui ont disparu.

## Reprendre une revue interrompue (`--resume`)

Une revue longue qui meurt en cours de route — une connexion interrompue, un timeout, un terminal tué — laisse tout ce qu'elle avait fait sur le disque : le worktree, le diff capturé, et le propre enregistrement du harnais de chaque agent exécuté. `--resume` continue à partir de là au lieu de recommencer :

```bash
/review 123 --resume
```

Cela s'applique **uniquement aux cibles PR** (le diff d'une revue locale provient d'un working tree actif, qui n'a pas d'état interrompu stable pour continuer), et il est sûr de le passer lorsque vous n'êtes pas sûr : la revue vérifie l'état sur le disque lui-même — le worktree toujours au commit récupéré et propre, le diff capturé inchangé octet pour octet, le head de la PR immobile, la limite de reprise non dépensée — et recommence silencieusement à zéro lorsque quelque chose ne correspond plus, en vous indiquant quel check a refusé. Une continuation réutilise les résultats certifiés d'agents de la tentative précédente, donc le rapport indique combien ont été récupérés ; c'est divulgué, jamais un trou de couverture.

Deux choses à savoir. Une continuation conserve l'**effort** de l'exécution interrompue : passer un `--effort` différent refuse la reprise et exécute une nouvelle revue au niveau demandé, car un effort différent est un travail différent. Et si le head de la PR a bougé pendant que la revue était arrêtée, la reprise refuse (`head-moved`) et la nouvelle revue examine les nouveaux commits — c'est ce que vous souhaitez, et cela compte comme le seul redémarrage de cette revue.

## Résultats en tant que données

Les résultats confirmés sont canonicalisés dans `.qwen/tmp/qwen-review-<target>-findings.json` avant que quoi que ce soit d'autre ne les consomme — le rapport terminal, le rapport Markdown sauvegardé et le JSON de revue PR lisent tous ce même artefact au lieu de re-taper la liste. Chaque résultat porte un `id` unique (sur lequel les outcomes et les ancres résolues se joignent), `severity`, `confidence`, `source`, `summary`, un `shortSummary` plafonné à 60 caractères pour le rendu en liste, `failureScenario`, et un ou plusieurs `locations` — un résultat agrégé par motif conserve **un emplacement par occurrence**, de sorte que chacun obtient toujours son propre commentaire inline.

**Avant toute chose, la revue vérifie qu'elle exécute votre code.** Chaque étape `qwen review …` exécute le bundle compilé, pas le working tree, donc une commande de revue modifiée depuis le dernier build n'a aucun effet et l'exécution mesure l'ancien comportement. Le build enregistre un digest des sources de revue qu'il a empaquetées ; `parse-args` le re-calcule et le compare, et `drive` vérifie à nouveau, car le brief du vérificateur envoie les agents directement là-bas sans étape 1. En cas de divergence, il indique sur stderr que le bundle n'a pas été compilé à partir de ces sources, et quoi recompiler. La vérification s'exécute lorsque le CLI résout vers le `dist/cli.js` empaqueté (le binaire `qwen`, ou `node dist/cli.js`) ; les lanceurs qui exécutent une sortie non empaquetée, tels que `npm start` et `npm run dev`, l'ignorent. Deux cas qu'elle ne peut pas comparer sont traités différemment : un checkout dont le build précède l'enregistrement se voit dire que la vérification n'a pas pu s'exécuter et pourquoi, et un package installé — qui n'a pas de sources auxquelles se comparer — reste silencieux. Le digest couvre les commandes de revue, le fichier qui les enregistre, le lease exclusif à la revue qu'elles importent depuis l'extérieur de leur répertoire, et le skill de revue empaqueté ; il ne suit pas celles-ci dans les helpers partagés qu'elles importent, donc une exécution silencieuse signifie que le code de revue correspond au bundle plutôt que l'ensemble de l'arborescence.

**Un Critical que la base de merge a déjà échoué est retenu, pas déposé.** Lorsqu'une commande de test a échoué et que la base de merge a pu être compilée, `test-delta` enregistre quels fichiers en échec échouent également sans la pull request. La canonicalisation relit cette mesure (`qwen review findings --test-delta`, à côté de `--outcomes`) : un Critical dont le propre texte nomme l'un de ces fichiers est rétrogradé en Suggestion, conserve sa preuve, gagne la mesure qui l'a rétrogradé et un champ `heldByMeasurement`, et la rétrogradation est annoncée. Un test qui était déjà au rouge n'est pas un test que cette pull request passe au rouge — et s'il échoue maintenant pour une _nouvelle_ raison, indiquez quel test, citez les deux côtés, et déposez-le à nouveau en Critical : un résultat qui porte déjà la mesure et est relevé de toute façon est laissé tel que vous l'avez mis.

La commande valide à l'écriture : un id dupliqué, un résultat sans scénario de défaillance, un tableau de locations vide, ou une sévérité inconnue constituent une erreur plutôt qu'une entrée silencieusement altérée.

## Images de preuve dans les commentaires de la PR

L'API GitHub ne peut pas joindre d'images aux commentaires de revue, donc `/review` peut héberger des images de preuve (captures d'écran TUI, comparaisons de rendu) dans un dépôt que vous désignez et les intégrer par URL :

```bash
export QWEN_REVIEW_ASSETS_REPO=your-org/your-repo   # un dépôt sur lequel vous pouvez pousser
/review 123 --comment
```

Les mainteneurs le pointent généralement sur le dépôt en cours de revue ; n'importe qui d'autre peut utiliser un fork ou un dépôt temporaire. Les images atterrissent sur la branche `pr-assets/<pr>-review` avec des noms hachés par contenu, et les commentaires les référencent par URL **épinglée par commit** — immuable même si la branche évolue ensuite, et fonctionnant de manière identique sur GitHub Enterprise.

Pour les revues déclenchées par GitHub (le workflow de revue de PR), la même variable est câblée depuis une **variable de dépôt** du même nom : avec la variable non définie, le workflow passe une valeur vide et la publication refuse — rien ne change. Un mainteneur qui définit `QWEN_REVIEW_ASSETS_REPO` dans les variables Actions du dépôt (généralement le dépôt lui-même) permet aux commentaires de revue d'intégrer des captures PNG ; les branches qu'il écrit sont nettoyées par le workflow de nettoyage visuel lorsque la variable pointe vers le même dépôt, tandis qu'une destination fork ou temporaire gère sa propre rétention.

La publication est soumise aux mêmes restrictions que la soumission : pas de dépôt désigné signifie pas de publication, et une exécution non autorisée (pas de `--comment` effectif) se voit refuser l'accès de la même manière que `submit`. Seuls les types d'images sont acceptés (SVG est exclu délibérément), avec des plafonds de taille, et les octets de chaque fichier doivent correspondre au format déclaré par son extension — un contenu mal étiqueté ou non reconnu est refusé. Un manifeste enregistre chaque fichier poussé. Sans désignation, les résultats conservent leurs preuves sous forme de chemins de fichiers locaux dans le terminal et le rapport sauvegardé — rien ne casse, les commentaires restent simplement en texte uniquement.

## Actions de suivi

Après la revue, des astuces contextuelles apparaissent sous forme de texte fantôme. Appuyez sur Tab pour accepter :

| État après la revue                  | Astuce             | Ce qui se passe                           |
| ------------------------------------ | ------------------ | ----------------------------------------- |
| Revue locale, `--fix` non passé      | `fix these issues` | Le LLM corrige interactivement chaque résultat |
| Revue de PR avec des résultats       | `post comments`    | Publie les commentaires inline de la PR (pas de re-revue) |
| Revue de PR, zéro résultat           | `post comments`    | Approuve la PR sur GitHub (LGTM)          |
| Revue locale, tout est clair         | `commit`           | Commit vos modifications                  |

Remarque : `fix these issues` n'est disponible que pour les revues locales, pour la même raison que `--fix` — pour les revues de PR, le worktree est nettoyé après la revue, il n'est donc pas possible de corriger interactivement après la revue — utilisez `--comment` ou `post comments` pour publier les résultats à la place. Quand `--fix` a été passé, les résultats portent déjà des outcomes et aucune astuce de correction n'est proposée.

## Règles de revue du projet

Vous pouvez personnaliser les critères de revue par projet. `/review` lit les règles depuis ces fichiers (dans l'ordre) :

1. `.qwen/review-rules.md` (natif Qwen Code)
2. `.github/copilot-instructions.md` (préféré) ou `copilot-instructions.md` (fallback — un seul est chargé, pas les deux)
3. `AGENTS.md` — section `## Code Review`
4. `QWEN.md` — section `## Code Review`

Les règles sont injectées dans les agents de revue LLM (0-6) en tant que critères supplémentaires. Pour les revues de PR, les règles sont lues depuis la **branche de base** pour empêcher une PR malveillante d'injecter des règles de contournement.

## Contexte du dépôt

Les dépôts peuvent fournir aux relecteurs des indications bornées et spécifiques au dépôt en commitant un manifeste JSON strict dans `.qwen/review-context.json`. À effort moyen ou élevé, `/review` lit le manifeste après avoir capturé le plan et attache les indications correspondantes avant qu'un agent ne se lance :

```json
{
  "version": 1,
  "label": "Example repository",
  "rules": [
    {
      "paths": ["packages/*/src/**"],
      "domains": ["runtime"],
      "relatedPaths": ["packages/runtime/src/**"],
      "recommendedTests": ["npm run test:runtime"],
      "requiredConfigurations": ["debug"],
      "requiredAgents": ["test-matrix"],
      "unverifiedDimensions": ["Alternate runtime was not exercised"],
      "verificationNotes": ["Use the repository native test runner"]
    }
  ]
}
```

Une règle s'applique lorsque tout fichier modifié correspond à l'un de ses globs `paths` (`*`, `?`, et segments `**` ; sensible à la casse). Toutes les règles correspondantes fusionnent leurs indications : domaines et fichiers liés pour les agents de revue, tests recommandés et configurations requises pour l'agent build-and-test, rôles de relecteur supplémentaires (honorés uniquement quand le niveau d'effort et la topologie choisis les exécutent), et limites de preuve que la revue finale divulgue comme dimensions non vérifiées. Les tableaux peuvent être écrits dans n'importe quel ordre ; les entrées dupliquées sont rejetées.

Pour les revues de PR, le manifeste est lu depuis la base de merge, afin que la PR en cours de revue ne puisse pas s'ajouter ou se retirer des indications ; les revues locales le lisent depuis le worktree actuel. Les revues à effort faible et inter-dépôts ignorent le contexte du dépôt. Le contrat complet et le modèle de confiance se trouvent dans le [document de conception](../../design/review-repository-context.md).

## Fidélité aux issues

Pour les PR de correction de bugs, l'agent de fidélité aux issues récupère les preuves de l'issue directement au lieu de s'appuyer sur le texte de description de la PR. Il exécute la sous-commande `qwen review issue-context <pr> --repo <owner/repo> --out <file>`, qui résout les métadonnées solides de GitHub concernant les issues de clôture puis récupère le titre, le **corps** (la reproduction originale du rapporteur) et le fil de commentaires complet de chaque issue référencée — chacun depuis le propre dépôt de l'issue (une PR peut fermer une issue dans un dépôt différent). Cet agent s'exécute uniquement pour les cibles de PR ; les revues de diff local et de chemin de fichier l'ignorent.

L'ensemble des issues de clôture est un indice de découverte plutôt qu'une preuve que l'auteur a lié la bonne issue : s'il est vide mais que la PR référence une issue cible apparente, l'agent la récupère tout de même après avoir jugé de sa pertinence (ré-exécution avec `--issue <n>` ; un nombre seul se résout dans le dépôt de la PR, tandis que `--issue <owner>/<repo>#<n>` récupère une référence inter-dépôts depuis son propre dépôt). Le texte de l'issue récupéré est traité comme des données non fiables (les faits sont extraits, les instructions intégrées ignorées). Pour les issues pertinentes, la reproduction originale, le payload observé, le comportement attendu et les commentaires du mainteneur sont traités comme les preuves de plus haute priorité pour déterminer si la PR résout le bon problème.

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

La correspondance de modèle contrôle également le scope incrémental, pas seulement l'ignorance : « nettoyer jusqu'au commit en cache » est le verdict du modèle précédent, donc lorsque de nouveaux commits sont arrivés depuis la revue en cache, une incompatibilité de modèle ne scope jamais à `lastCommitSha..HEAD` — la plage est le diff complet, notant « La ronde précédente a été examinée par qwen3-coder. Exécution d'une revue complète avec gpt-4o. » — sauf si une ancre certifiée par le modèle en cours d'exécution est récupérée depuis la dernière revue publiée (ci-dessous), qui scope la plage à la place. Les résultats de la ronde précédente sont toujours reportés pour être re-réglés ; seule l'ancre ne l'est pas. La même gate lie l'ancre récupérée depuis le marqueur de registre machine de la dernière revue publiée lorsque le cache est absent ou que son ancre est inutilisable (CI, un autre clone) : elle scope la plage incrémentale uniquement si le modèle en cours d'exécution l'a certifiée — un marqueur certifié par un modèle différent, ou ne portant aucun modèle (une revue publiée avec `review.attribution` désactivé, ou une revue d'avant l'existence du champ), revient au diff complet.

Le cache est stocké dans `.qwen/review-cache/` et suit à la fois le SHA du commit et l'ID du modèle. Assurez-vous que ce répertoire est dans votre `.gitignore` (une règle plus large comme `.qwen/*` fonctionne également). Si le commit en cache a été supprimé lors d'un rebase, le système revient à une revue complète ; Aone règle l'ancre en cache différemment — voir son paragraphe ci-dessous. Seules les revues à effort élevé consultent ou écrivent le cache — une passe rapide avec `--effort low|medium` ne compte jamais comme « déjà revue ».

## Rapports de revue

Pour les revues dans le même dépôt, les résultats sont enregistrés sous forme de fichier Markdown dans le répertoire `.qwen/reviews/` de votre projet (les revues légères inter-dépôts ne persistent pas le rapport) :

```
.qwen/reviews/2026-04-06-143022-pr-123.md
.qwen/reviews/2026-04-06-150510-local.md
```

Les rapports incluent : l'horodatage, les statistiques du diff, les résultats de build/test, toutes les découvertes avec leur statut de vérification, et le verdict. Les titres de sections et la prose descriptive suivent la préférence de langue de sortie ; les identifiants techniques (SHAs, chemins de fichiers, noms de portes, ids de résultats) restent verbatim.

Les revues à effort moyen et élevé sauvegardent également un compagnon JSON structuré avec le même préfixe (par exemple, `2026-04-06-143022-pr-123.json`) contenant les résultats canonicalisés et le verdict composé sous forme de données. Le Web Shell de Qwen Code affiche ce document comme une vue de revue interactive avec des résultats filtrables ; le rapport Markdown reste l'archive lisible par un humain.

Les moitiés déterministes du pipeline — l'analyse des arguments (`qwen review parse-args`) et la décision événement/corps (`qwen review compose-review`) — sont des sous-commandes testées plutôt que du texte de prompt, donc la grammaire de `--effort`, le forçage de `--comment`, les plafonds de verdict et le comportement de rétrogradation sont fixés par des tests unitaires et ne peuvent pas dériver avec le modèle.

**GitHub Enterprise :** la revue d'une URL de PR sur un hôte autre que `github.com` achemine chaque appel GitHub vers cet hôte — les sous-commandes de revue (`match-remote`, `meta`, `fetch-pr`, `pr-context`, `comment-status`, `issue-context`, `fetch-diff`, `comment-body`, `plan-diff`, `test-plan`, `presubmit`, `compose-review`, `submit`, `publish-assets`) acceptent `--host` et le définissent en code, de sorte qu'un hôte oublié ne peut pas rediriger silencieusement la revue vers `github.com`.

**Aone Code :** pour un clone dont l'origine est sur `gitlab.alibaba-inc.com`, exécutez `/review` depuis l'intérieur de ce clone — la plateforme est détectée depuis le remote et les sous-commandes fonctionnent, supportées par le CLI `a1` (au moins 0.1.90 — une installation plus ancienne est refusée au moment de l'authentification avec un message de mise à jour) — le numéro cible est l'id global de MR. `fetch-pr` récupère `refs/merge-requests/<id>/head` et construit le worktree + diff, donc la revue par les agents du worktree est inchangée, et `test-plan` fonctionne aussi — il lit la description de la MR via le même lecteur. `pr-context` est également supporté : il lit les métadonnées de la MR, les fils de discussion et les résumés qwen précédemment publiés (le registre machine les récupère depuis eux), de sorte qu'une exécution Aone voit la discussion existante de la MR exactement comme une exécution GitHub voit celle d'une PR. `comment-status` et `presubmit` sont également supportés par a1 (presubmit entièrement : détection d'auto-PR, dérive du head, CI de merge-gate, et déduplication des commentaires existants), de sorte que les tours répétés de `--comment` dédupliquent contre les commentaires existants de la MR au lieu de les re-publier (un fil marqué comme obsolète par la plateforme — sa ligne ne correspond plus après une modification — reste re-publiable), et la détection d'auto-PR fonctionne aussi. L'écriture `publish-assets` est ignorée. `--comment` **publie** la revue via le CLI `a1` : un commentaire par résultat inline, puis le commentaire de résumé. Aone n'a pas d'état natif de demande de modifications — sur ce verdict le commentaire de résumé porte un en-tête bloquant, et tout Critical inline effectivement publié bloque le merge via la porte de discussion tant que leurs discussions restent non résolues (lorsqu'aucun Critical inline n'a été publié, l'en-tête est consultatif et rien ne bloque mécaniquement le merge). Les commentaires publiés ne portent pas d'indicateur de commentaire IA — `a1` ne peut pas en définir — donc la gate de merge `ai_comment` dédiée du repo ne les suit pas. Le `a1 repo mr approve` natif se déclenche pour un verdict Approve lorsque l'exécution a lu le contexte de la MR (la même gate que GitHub ; une exécution sans contexte disponible reste plafonnée à Comment). La re-revue incrémentale suit le modèle de mise à jour AGit-Flow : une mise à jour MODIFIE le single commit CR en place, orphelinant le head que la ronde précédente a examiné — donc l'ancre en cache est évaluée SANS ascendance (le test ancre-derrière-head échouerait à chaque mise à jour), et la re-revue scope le diff de la PR aux fichiers que la mise à jour a touchés au lieu de revenir à une revue complète ; une mise à jour qui a aussi rebasé sur un master plus récent conserve ce scope uniquement tant que la dérive du rebase reste dans les fichiers du CR — une dérive touchant tout autre fichier revient à la revue complète, et aucun octet de dérive n'entre dans le scope publié de toute façon. Voir `docs/design/2026-08-15-review-aone-provider.md`.

Chaque exécution se termine par une ligne lisible par machine (`Review complete: <target> — <disposition>`), de sorte que les scripts et les wrappers CI peuvent détecter la fin et le résultat avec un simple match `^Review complete: `.

## Exécutions headless (`qwen review run`)

`/review` est interactif. Lorsqu'un script ou un job CI a besoin d'exécuter une revue et d'agir sur son résultat, utilisez le wrapper headless :

```bash
qwen review run [target] [--json] [--fail-on request-changes] [--comment] [--resume] [--quiet]
```

`target` est un numéro de PR, une URL de PR ou un chemin de fichier ; omettez-le pour revoir le working tree local. La commande exécute le CLI de cette build de manière non interactive (avec stdin fermée, de sorte que la détection de slash commands survit), diffuse la progression de l'enfant sur **stderr**, et affiche le verdict sur **stdout** — ou, avec `--json`, l'objet résultat complet. Le verdict est lu depuis l'artifact que `compose-review` écrit (le même JSON que le skill traite comme autorité de verdict), jamais parsé depuis la prose du modèle.

Le code de sortie est le contrat qu'une gate doit lire :

| Sortie | Signification                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------- |
| `0`    | La revue a terminé (quelle qu'ait été sa décision)                                                |
| `1`    | Elle n'a pas atteint de verdict — l'enfant a échoué, expiré ou n'a laissé aucun artifact composé  |
| `3`    | Elle a terminé avec `REQUEST_CHANGES` **et** `--fail-on request-changes` était défini (blocage opt-in) |

`3` (et non `2`) permet à une gate de distinguer « la revue bloque » de « l'outil est cassé » — yargs utilise déjà `1` pour les erreurs d'utilisation — sans parser aucune sortie. `--timeout-minutes` (défaut 120, plafonné à 1 minimum) termine une revue bloquée et sort avec le code `1`, et l'annulation de la commande (Ctrl+C / SIGTERM) termine le groupe de processus de la revue plutôt que de le laisser orphelin.

`--resume` continue une revue interrompue de la même PR au lieu de recommencer — lorsqu'une longue exécution locale meurt en cours de route (une connexion interrompue, un timeout, un terminal tué), la tentative aurait sinon re-récupéré, re-découpé et re-lancé des agents dont le travail est déjà sur le disque. Il est sûr de le passer sans condition lors d'une nouvelle tentative : `fetch-pr` vérifie l'état sur le disque lui-même (worktree toujours au SHA récupéré et propre, octets de diff inchangés, head de la PR immobile, plafond de reprise non dépensé) et revient silencieusement à une revue fraîche lorsque quelque chose ne correspond plus, donc le flag ne fait jamais échouer une exécution qui pourrait recommencer. Une continuation est épinglée à l'effort enregistré de l'exécution interrompue — un `--effort` explicitement différent refuse la reprise et exécute une nouvelle revue au niveau demandé. Cibles PR uniquement (le diff d'une revue locale est capturé depuis un working tree actif, qui n'a pas d'état interrompu stable pour continuer). La reprise est une **commodité locale** : le workflow CI de revue du dépôt ne reprend **pas** — chaque nouvelle tentative ré-exécute à partir de zéro, car une tentative CI s'exécute sans sandbox et son worktree est supprimé à la sortie, ne laissant aucun état interrompu pour continuer.

Une exécution avec budget temps peut aussi exporter une deadline **souple** pour que la revue arrête sa boucle d'audit inverse ouverte tandis qu'il reste encore du temps pour vérifier, composer et publier : `QWEN_REVIEW_DEADLINE_EPOCH` est le moment en secondes Unix auquel l'exécution sera tuée, et `QWEN_REVIEW_DEADLINE_RESERVE_SECONDS` (défaut 3600 ; `0` garde uniquement l'estimation du tour) est la queue qui doit rester pour la vérification du dernier tour, `compose-review` et la soumission. Lorsque le budget restant ne peut plus accueillir un autre tour plus cette queue, le constructeur de tours refuse de le construire, et le verdict composé divulgue l'audit tronqué (un verdict autrement Approve est plafonné à Comment). Une deadline manquante ou malformée laisse la revue non plafonnée — le timeout externe borne toujours l'exécution.

Niché dans cette réserve se trouve un **plancher de composition** plus petit, `QWEN_REVIEW_DEADLINE_COMPOSE_FLOOR_SECONDS` (défaut 1200 ; `0` désactive complètement cette porte, à chaque instant y compris après la deadline). La réserve est un nombre unique couvrant « vérifier le dernier tour **plus** composer **plus** soumettre », ce qui convient pour un re-trace normal par résultat mais pas pour une revue de sécurité dont la vérification relance des workloads filesystem/git réels sans borne. Ainsi le vérificateur — et non le constructeur de tours — est plafonné par ce plancher : une fois le plancher ou moins restant, `agent-prompt --role verify` refuse de construire (une ligne `VERIFY BUDGET:`, sortie **4**), les résultats en main conservent leur tag non vérifié (ce qui plafonne le verdict), et `compose-review` et la soumission s'exécutent. Le plancher est strictement inférieur à la réserve, donc une exécution saine atteint la porte de l'audit inverse d'abord et ne l'atteint jamais ; c'est la couverture de la seule plage que la réserve ne peut pas borner.

## Analyse d'impact inter-fichiers

Un traceur inter-fichiers dédié (Agent 1c) possède cette analyse de bout en bout. Lorsque les modifications de code altèrent des fonctions, classes ou interfaces exportées, il recherche tous les appelants et vérifie la compatibilité :

- Modifications du nombre ou du type de paramètres
- Modifications du type de retour
- Méthodes publiques supprimées ou renommées
- Modifications de l'API entraînant une rupture de compatibilité

Il parcourt également la **direction producteur** : chaque champ, option ou paramètre optionnel ajouté par le diff est tracé jusqu'à ses sites de lecture — y compris les fichiers que le diff ne touche jamais. Un chemin de code actif lisant un champ que rien ne peuple signifie que la fonctionnalité qu'il contrôle ne fait silencieusement rien, et cela est signalé comme Critical au site de lecture.

Pour les diffs importants (>10 symboles modifiés), l'analyse côté appelant priorise les fonctions dont la signature a changé ; la direction producteur n'est jamais limitée par un budget, car une signature inchangée est exactement son objectif.

## Budget de revue

Les parties du pipeline qui sont élastiques en taille de diff sont mises à l'échelle en fonction de celle-ci, et la mise à l'échelle est écrite dans le plan de diff pour que chaque étape lise un seul nombre plutôt que de décider individuellement :

| Champ de budget   | Ce qu'il scope                        | Comment il est mis à l'échelle                                     |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------ |
| `inlineAngles`    | Combien d'angles `low` s'exécutent (Étape 3C) | 3, plus un par 60 lignes source, plafonné aux 6 angles qui existent |
| `sweep`           | Si le balayage de lacunes de `low` s'exécute | Désactivé en dessous de 25 lignes source                             |
| `specialistCap`   | Le plafond de l'Agent 8               | 0 en dessous de 80 lignes source, sinon 2                        |
| `verifyShard`     | Résultats par agent de vérification   | Fixe à 8 — une propriété du vérificateur, pas du diff            |

Deux choses qu'il ne fait délibérément pas. Il **ne retire jamais une dimension de la liste** : les agents qu'une revue doit inclure sont décidés par le roster, qui lit le niveau d'effort, de sorte qu'un petit diff obtient toujours son passage de sécurité et son passage de couverture de tests. Et il lit les lignes **source**, pas les lignes de diff — un changement de production de 40 lignes livrant 900 lignes de nouveaux tests est un petit changement, et le même raisonnement gouverne déjà la porte du fan-out par territoire.

Pourquoi les planchers sont là où ils sont : sur une correction de typo de neuf lignes, six parcours inline sont cinq parcours de rien, et le balayage — un nouveau lecteur cherchant ce que la première passe n'a pas atteint — n'a rien à chercher quand la première passe a atteint tout le code. Le plancher de l'Agent 8 est le plus substantiel : « un domaine domine le diff » est un jugement, et un jugement porté sur quarante lignes trouve un domaine dominant à chaque fois, car quarante lignes sont généralement une seule chose.

## Efficacité des tokens

Le pipeline à effort élevé borne chaque étape (taille des fragments, tours d'audit), mais le total des appels varie avec les résultats — `ceil(F/8)` fragments de vérification — et, en 3B, avec le nombre de chunks (l'audit inverse s'exécute par chunk par tour). Profil 3A typique :

| Étape                            | Appels LLM                       | Notes                                                                                                                                                                                               |
| -------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agents de revue (Étape 3)        | 16 (+0-2)                       | Exécutés en parallèle ; l'Agent 1e uniquement quand le diff signale un type enveloppant (15 sans lui) ; inter-repos ignore les Agents 1c et 7 (14), local/fichier ignore l'Agent 0 (15)              |
| Vérification fragmentée (Étape 4)| ceil(F/8)                       | F = résultats ; au plus 8 par agent de vérification, lancés ensemble                                                                                                                                |
| Audit inverse itératif (Étape 5) | 2-10 (3A) ; tours × chunks (3B) | Deux tours consécutifs sans résultat pour arrêter ; la limite suit la topologie — 10 sur un petit diff, 5 sur un diff découpé en chunks, 3 sur un énorme diff avec deadline. 3B répartit un auditeur par chunk par tour |
| **Total**                        | **~19-30 (~17-29)**             | 3A même dépôt : ~19-30 (typique ~19-21) ; inter-repos ou local/fichier : ~17-29 ; un de moins quand l'Agent 1e n'est pas au roster ; 3B varie avec les chunks (voir DESIGN.md)                       |

La plupart des PR convergent vers la limite inférieure de la plage ; les plafonds empêchent l'explosion des coûts dans les cas pathologiques. Avec `--effort low`, la revue s'exécute entièrement en inline — **0 appels de sous-agents** — parcourant le diff une fois par angle au lieu d'une fois au total.

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
- Chaque résultat nomme un scénario de défaillance concret (déclencheur → résultat erroné) ou un coût concret — un résultat qui ne le peut pas est supprimé avant de vous atteindre
- Même motif sur N fichiers → agrégé en une seule découverte
- Les commentaires de PR sont réservés à la haute confiance uniquement (et uniquement issus de revues vérifiées à effort élevé)
- Le style ou le formatage cosmétique correspondant aux conventions de la codebase est exclu
