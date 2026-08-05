# Gate de triage par motif de revert

Date : 2026-07-27
Statut : Proposé
Domaine : Triage CI — `.github/workflows/qwen-triage.yml`, `.qwen/skills/triage/`

## Problème

Les petites PR de maintenance neutres en comportement consomment actuellement
la même capacité de triage multi-étapes et de revue par modèle que les
changements de comportement. La proposition initiale (PR #7414) tentait de les
filtrer, mais une mesure du backlog live par un mainteneur a montré un taux de
succès d'environ 2 % seulement — la fonctionnalité ciblait un problème quasi
inexistant.

Pendant ce temps, le dépôt compte **111 commits de revert** dans son
historique (19 rien qu'en juillet 2026), et **61,5 % des reverts surviennent
dans les 24 heures suivant le merge** — ce qui signifie que le problème est
détecté rapidement mais après être déjà sur `main`. Le coût réel n'est pas de
relire des PR inoffensives ; c'est de merger des PR qui devront être
annulées.

Ce design propose une gate de triage fondée sur les données qui cible les PR
qui causent réellement des reverts, pas celles qui sont déjà inoffensives.

## Données

### Méthodologie

Analyse en trois phases de l'historique complet des reverts du dépôt :

1. **Collecte** : `git log --all --grep="^Revert "` a trouvé 111 commits de
   revert. Le corps de chaque revert a été parsé à la recherche de
   `This reverts commit <hash>`, puis le commit d'origine a été retracé
   jusqu'à sa PR via `gh api`. Résultat : 46 PR revertées uniques (59 reverts
   retraçables jusqu'à un numéro de PR ; 52 reverts n'avaient que le titre du
   commit d'origine sans lien de PR).

2. **Enrichissement** : Pour chaque PR revertée, extraction des signaux
   observables au moment du triage : périmètre touché
   (core/auth/providers/tools/services), taille du diff, nombre de tours de
   revue, constats Critical du bot, cycles CHANGES_REQUESTED, délai
   merge→revert, auto-revert, présence d'une vérification E2E. 31 des 46 PR
   ont été enrichies avec succès ; 15 sont supprimées et inaccessibles
   (HTTP 404).

3. **Comparaison avec un groupe de contrôle** : Échantillonnage de 60 PR
   récemment mergées mais non revertées et extraction des mêmes signaux.
   Calcul de la précision (TP / (TP + FP)) et du rappel pour chaque signal.

Scripts et données brutes (artefacts d'analyse locaux, non commités) :
`.qwen/scripts/revert-analysis-*.mjs`, `.qwen/scripts/revert-data-*.json`,
`.qwen/scripts/revert-analysis-report-v2.json`.

### Précision et rappel des signaux

| Signal                       | Précision | Rappel | Revertées (n=31) | Contrôle (n=60) |
| ---------------------------- | --------- | ------ | --------------- | -------------- |
| `touches_high_risk`          | **66,7%** | 32,3%  | 10              | 5              |
| `non_maintainer + high_risk` | **58,3%** | 22,6%  | 7               | 5              |
| `core + contested`           | **50,0%** | 19,4%  | 6               | 6              |
| `non_maintainer + core`      | 46,2%     | 38,7%  | 12              | 14             |
| `touches_core`               | 44,7%     | 54,8%  | 17              | 21             |
| `has_contested_pattern`      | 40,9%     | 29,0%  | 9               | 13             |
| `had_changes_requested`      | 40,7%     | 35,5%  | 11              | 16             |
| `non_maintainer`             | 39,6%     | 67,7%  | 21              | 32             |
| `large_diff_gt_200`          | 37,0%     | 54,8%  | 17              | 29             |
| `critical_count > 0`         | 28,6%     | 12,9%  | 4               | 10             |
| `fast_revert_24h`            | 100,0%    | 25,8%  | 8               | 0              |
| `self_reverted`              | 100,0%    | 9,7%   | 3               | 0              |

**Avertissement sur l'échantillonnage :** la précision est calculée sur un
ratio cas-contrôle de 1:1,9 (31 revertées contre 60 contrôles), alors que le
taux de base réel du dépôt est d'environ 1,37 % (46/3358). La précision (PPV)
est la métrique la plus sensible à cet enrichissement — la valeur prédictive
positive réelle au taux de base du dépôt est bien plus faible (par exemple
environ 5 % pour `touches_high_risk`). La sensibilité (rappel) et la
spécificité sont invariantes au ratio d'échantillonnage et sont les métriques
appropriées pour comparer les signaux. Le _classement_ des signaux par
précision reste valide (il est monotone dans le ratio de vraisemblance à n
fixe), mais les valeurs absolues ne doivent pas être citées aux contributeurs
comme des probabilités a posteriori.

`fast_revert_24h` et `self_reverted` ont une précision de 100 % mais ce sont
des **signaux post-merge** — ils ne peuvent pas être utilisés comme gates de
triage car ils ne sont observables qu'après que la PR est déjà mergée et
revertée. Ils confirment que le problème existe mais n'aident pas à le
prévenir.

`critical_count > 0` était initialement considéré comme un signal fort (le bot
avait signalé la cause racine exacte dans des études de cas comme la PR
#6866), mais après correction de la regex pour ne faire correspondre que les
tags `**[Critical]**` (et non le mot nu « critical » dans une prose comme « no
critical blockers »), la précision est tombée à 28,6 %. Le bot est trop prompt
à émettre des constats Critical — 16,7 % des PR du groupe de contrôle ont
aussi des tags Critical.

### Définition des chemins à haut risque

Le signal `touches_high_risk` vérifie si un fichier modifié correspond à l'un
de ces motifs de sous-système :

- `openaiContentGenerator` — parsing des réponses en streaming
- `streamingToolCallParser` — parsing du flux d'appels d'outil
- `geminiChat` — pipeline de chat Gemini
- `acpConnection` — spawn de processus ACP
- `shell.ts` / `shellExecutionService` — exécution de l'outil shell
- `mcp-client` / `mcp-pool` — gestion des serveurs MCP
- `LspServer` — gestion des serveurs LSP
- `acp-integration` — intégration de session ACP
- `relaunch.ts` — cycle de vie de relance de l'application desktop
- `sandbox.ts` — gestion des processus sandbox
- `electron-run-as-node` — point d'entrée Electron en mode node
  (correspondance de chemin)

Ce sont les chemins où des changements incorrects sont le plus susceptibles de
causer des régressions observables nécessitant un revert.

### Délai merge→revert

Sur 13 PR avec des données de délai valides (non négatives, post-merge) :

- Médiane : 4 heures
- Dans les 24 h : 61,5%
- Dans les 72 h : 84,6%
- Max : 97 heures

Cela confirme que les défauts causant des reverts apparaissent rapidement
après le merge, mais le dommage est déjà sur `main`.

### PR flip-flop

8 PR ont été revertées plusieurs fois (cycles revert → re-revert), indiquant
une contestation non résolue :

- PR #6754 (3 reverts), PR #6751 (3 reverts), PR #3433 (3 reverts)
- PR #6869 (2 reverts), PR #5668 (2 reverts), PR #3567 (2 reverts),
  PR #3478 (2 reverts), PR #5060 (2 reverts)

Ces PR flip-flop sont les résultats au coût le plus élevé — elles consomment
plusieurs tours de revue, plusieurs cycles de merge/revert et nécessitent
souvent des releases de correctif.

## Design

### Escalade des chemins à haut risque

Quand une PR de non-mainteneur touche un chemin à haut risque (voir la
définition ci-dessus), le triage de Stade 1 fait passer la PR au niveau de
revue le plus profond au lieu du chemin normal. Cela ne **bloque** ni ne ferme
la PR — cela garantit que le pipeline `/review` complet s'exécute avec une
couverture d'agents maximale.

C'est le signal le plus fort au moment du triage : 10 des 31 PR revertées
(sensibilité de 32,3 %) touchaient ces chemins, contre 5 des 60 PR de
contrôle (spécificité de 91,7 % ; Fisher p = 0,006).

Implémentation : le texte du skill du Stade 1e demande au modèle de triage
d'exécuter `gh pr view --json files | grep -E '...'` sur les motifs de chemins
à haut risque. Aucun changement du YAML du workflow n'est nécessaire — la
détection s'exécute à l'intérieur du skill, pas comme une étape de workflow
séparée.

### Ce que ce design ne fait PAS

- **Ne ferme ni ne rejette automatiquement les PR.** La gate escalade la
  profondeur de revue et recommande l'attention d'un mainteneur ; elle ne
  bloque jamais le merge ni ne ferme la PR.
- **N'utilise pas les constats Critical du bot comme signal.** Les données
  montrent une précision de 28,6 % — le bot émet des Critical sur 16,7 % des
  PR sûres aussi. Les Critical sont trop bruyants pour servir de gate.
- **Ne filtre pas uniquement par taille de PR.** `large_diff_gt_200` a une
  précision de 37,0 % — la taille sans contexte n'est pas prédictive.
- **N'exige pas de vérification E2E pour toutes les PR.** `no_e2e` n'est pas
  discriminant — 100 % du groupe de contrôle n'a pas non plus de commentaires
  E2E, donc le signal ne peut pas distinguer les PR à risque de revert des PR
  sûres.

## Comparaison avec la PR #7414

|                     | PR #7414 (neutre en comportement)         | Ce design (motif de revert)               |
| ------------------- | ----------------------------------- | ------------------------------------------ |
| Signal              | « le diff est entièrement neutre en comportement » | « touche des chemins à haut risque »                  |
| Rappel des reverts       | non mesuré (aucun revert à comparer)  | 32,3% (10/31)                              |
| Spécificité         | n/d                                 | 91,7% (55/60)                              |
| Cibles              | PR inoffensives (coût : faible)            | PR dangereuses (coût : élevé)                 |
| Coût des faux positifs | saute la revue d'une PR utile         | escalade la profondeur de revue (temps de revue supplémentaire) |

## Fichiers modifiés

- `.qwen/skills/triage/references/pr-workflow.md` — ajout de la checklist du
  Stade 1e pour les chemins à haut risque. La détection s'exécute à
  l'intérieur du skill de triage (le modèle exécute lui-même
  `gh api --paginate … | grep …`), donc aucun changement du YAML du workflow
  n'est nécessaire.
- `scripts/tests/qwen-triage-workflow.test.js` — assertit que les chaînes de
  routage des chemins à haut risque existent dans le markdown du skill de
  triage.
- `.github/scripts/qwen-triage-workflow.test.mjs` — les mêmes assertions dans
  le runner node:test.

## Non-objectifs / suites

- **Affinement des Critical du bot.** La détection actuelle des Critical par
  le bot est trop bruyante (précision de 28,6 %). Si le bot pouvait
  distinguer un « Critical non résolu » d'un « Critical résolu » (en vérifiant
  si le fil du constat a été marqué comme résolu), le signal pourrait devenir
  utile. C'est une amélioration distincte du bot, pas un changement de la gate
  de triage.
- **Groupe de contrôle aligné dans le temps.** Le groupe de contrôle actuel
  est échantillonné parmi les 200 PR les plus récemment mergées, mais les PR
  revertées s'étalent sur 2025–2026. Un groupe de contrôle aligné dans le
  temps donnerait des taux de faux positifs plus précis. L'API `gh pr list` ne
  prend pas en charge la pagination profonde, donc cela nécessite une
  récupération basée sur un curseur GraphQL.
- **Récupération des 15 PR supprimées.** 15 des 46 PR revertées sont
  supprimées et inaccessibles via l'API GitHub. Leurs motifs peuvent différer
  des 31 que nous avons pu enrichir. Aucun chemin de récupération n'existe —
  GitHub supprime définitivement les PR fermées dans certains états.
- **Détection de flip-flop comme gate temps réel.** L'analyse actuelle détecte
  les flip-flops rétrospectivement (après plusieurs reverts). Une version temps
  réel surveillerait les motifs revert→re-revert sur `main` et alerterait les
  maintainers. Cela nécessite un workflow de surveillance séparé, pas une gate
  de triage.
- **Élargissement de la liste des chemins à haut risque.** La liste actuelle
  est organisée manuellement à partir des chemins de fichiers des PR
  revertées. À mesure que la base de code évolue, de nouveaux chemins à haut
  risque peuvent apparaître. Une ré-exécution périodique des scripts d'analyse
  garderait la liste à jour.
