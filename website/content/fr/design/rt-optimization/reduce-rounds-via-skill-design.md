# Plan de réduction des tours de l'Agent Loop : partir de la conception des Skills

> Ce document se trouve dans le même répertoire que `rt-optimization-design.md` et le complète : ce dernier traite de la réduction des tours au **niveau du framework** (D1 saut du tour de résumé final, routage rapide D2, prévalidation D4), tandis que celui-ci affirme que **le véritable levier pour réduire les tours se situe au niveau de la conception des skills/tools**, et propose une voie de mise en œuvre réalisable qui ne dépend ni d'une refonte du framework, ni des données de taux de succès du cache.

---

## 0. Spécifications de validation (gate pré-développement)

> Cette section est la **gate pré-développement** — elle liste les spécifications qui doivent être confirmées avant de commencer, et celles qui doivent attendre d'être pilotées par les données. Mettre les spécifications en amont plutôt que « faire puis voir les métriques » vise à éviter : (a) d'écrire et de découvrir ensuite que la métrique n'est pas mesurable, (b) des seuils qui dérivent avec les résultats, rendant la conclusion invalide, (c) l'absence de ligne d'arrêt qui plonge la solution dans un « on dirait qu'on avance, mais aucun bénéfice ».
>
> **Périmètre d'application de ce cadre de spécifications** : Ce cadre suppose que la justesse de la direction peut être jugée après la mesure de la baseline P1.5. Cette hypothèse est valable pour le scénario de « réduction des tours », car il a des signaux mesurables clairs (nombre de tours, followup_rate, batch_size). **Pour les scénarios hors de cette hypothèse** (par exemple, utiliser ce même cadre à l'avenir pour une « optimisation de la qualité » difficilement quantifiable), mettre les spécifications en amont pourrait entraver l'apprentissage rapide ; dans ce cas, revenir au processus de gouvernance du §0.5 pour réévaluer, sans appliquer mécaniquement ce cadre.

**Les spécifications sont divisées en quatre couches — avec des moments de verrouillage différents** :

| Niveau | Type                                               | Moment de verrouillage                   |
| :----- | :------------------------------------------------- | :--------------------------------------- |
| §0.1   | Spécifications de couche d'ingénierie (pipeline de données, correctitude des changements de code) | **En amont**, verrouillable immédiatement |
| §0.2   | Spécifications de couche statistique (indicateurs de « succès » du projet) | **En amont**, seuils à verrouiller après la baseline P1.5 |
| §0.3   | Lignes d'arrêt (conditions dures « si ça arrive, on abandonne ») | **En amont**, non modifiables            |
| §0.4   | Spécifications par skill (quoi modifier exactement, quel objectif) | **En aval**, piloté par les données de la Layer 1 |

### 0.1 Spécifications de couche d'ingénierie (doivent être en amont · verrouillables immédiatement)

Spécifications de correctitude pour le pipeline de données et les modifications de code — ne dépendent d'aucun jugement métier ni donnée de baseline, doivent être verrouillées avant le développement :

- **Fluidité de la chaîne qwen-logger** (§4.1.1b) : L'événement `skill_launch` doit pouvoir atterrir à la fois sur le pipeline OTLP et le pipeline qwen-logger
- **Chaînage par `prompt_id`** : Le `skill_launch` déclenché par un seul `user prompt` et les `tool_call` suivants doivent pouvoir être grepés avec le même `prompt_id` pour obtenir une trace complète
- **`batch_size` non-undefined** (Direction A §4.3.2) : Les batchs d'un seul outil doivent explicitement définir `batch_size = 1` / `batch_position = 0`
- **SQL exécutable** (§4.1.2) : Le SQL hors ligne doit produire un résultat non vide sur le backend de télémétrie réel et doit pouvoir distinguer les skills à `followup_rate` élevé/faible
- **Variance de la baseline < P50 × 20%** (P1.5) : La mesure de la baseline doit être stable (sinon la comparaison A/B ultérieure n'est pas fiable) — Note : bien que listée dans la couche d'ingénierie §0.1, son **verrouillage dépend des données de la baseline P1.5**, c'est le seul élément de validation en aval du §0.1 ; si P1.5 n'est pas validé(e), les seuils du §0.2 ne peuvent pas être verrouillés de manière fiable
- **Budget de taille du Skill** (Refonte Layer 2) : Après l'inlining du followup, le nombre de tokens de la description du skill ne doit pas dépasser 2× celui d'avant la refonte, et la valeur absolue doit être ≤ 500 tokens (prendre la plus petite valeur). En cas de dépassement, diviser le skill (§4.2) plutôt que de le fusionner. Cette règle est alignée avec la règle n°2 du §7 et la contrainte existante du §4.2, et est promue au niveau des spécifications
- **`npm run preflight` doit tout passer** : Seuil dur pour chaque PR

### 0.2 Spécifications de couche statistique (doivent être en amont · seuils à verrouiller après P1.5)

Indicateurs de « succès statistiquement significatif » du projet — la **direction** est fixée en amont, le **seuil** est verrouillé après la mesure de la baseline (pour éviter de remplir des chiffres arbitrairement) :

| Métrique                                                | Direction | Moment de verrouillage | Seuil actuel (à calibrer) |
| :------------------------------------------------------ | :-------- | :--------------------- | :------------------------ |
| `followup_rate` pondéré du top-3 skills                 | ↓         | Fin de P1.5            | ≥ 30%                     |
| RT P50 de bout en bout pour les sessions contenant un skill | ↓         | Fin de P1.5            | ≥ 2s                      |
| Proportion de `tool_call` avec `batch_size > 1`         | ↑         | Avant P3               | ≥ 30%                     |
| Significativité A/B du scénario de déclenchement du skill modifié | p < 0.05 | Avant la fin de la modif P2 | n à déterminer        |

> **Contrainte clé** : Les seuils provisoires ne sont pas des engagements. Si la baseline P1.5 montre que le « followup_rate pondéré du top-5 skills < 30% » (déclenche la ligne d'arrêt §0.3 #1), le projet est arrêté ; **il n'est pas acceptable de baisser la spécification pour que le seuil « soit atteint »**.
>
> **Comment mesurer** : La méthode de mesure, le template SQL et la conception A/B pour chaque métrique sont détaillés aux §5.1-§5.2 ; le calcul de la taille de l'échantillon pour la significativité statistique (p < 0.05) est au §5.1.

### 0.3 Lignes d'arrêt (doivent être en amont · ajustables de manière limitée après le verrouillage P-1)

Listées au §5.3. Ce sont des conditions dures « si ça arrive, on abandonne » — **en aucun cas, on ne peut assouplir les lignes d'arrêt pour atteindre les spécifications statistiques du §0.2**.

- **Indicateurs de résultat** (3 règles) : `followup_rate` pondéré du top-5 < 30% / après modification de 2 skills, RT P50 ↓ < 1s / `batch_size P50` toujours = 1 après Layer 3
- **Indicateurs de processus** (3 règles) : Taux de hit du skill ↓ ≥ 5pp / Taux d'échec de l'inlining du followup ≥ 5% / Taux d'annulation par l'utilisateur ↑ ≥ 2pp

Voir §5.3 pour les détails.

**Règles d'ajustabilité** (pour éviter une rigidité de discipline sans support de données) :

| Phase                        | Ajustable ?                                   | Direction d'ajustement                                                                 |
| :--------------------------- | :-------------------------------------------- | :------------------------------------------------------------------------------------- |
| Au verrouillage P-1          | ✅ Ajustable librement (basé sur la télémétrie historique ou le consensus) | Quelconque                                                                             |
| Après verrouillage P-1 → Fin P1.5 | ❌ Non ajustable                              | —                                                                                      |
| Fin P1.5 (à la sortie de la baseline) | ✅ Un seul **assouplissement** autorisé          | Assouplissement (ex. 30% → 25%) nécessite preuve de données + revue par 2 personnes ; **le resserrement n'est pas autorisé** (pour éviter d'ajouter des lignes d'arrêt après coup) |
| Après P1.5                 | ❌ Non ajustable                              | —                                                                                      |

> Les seuils provisoires (30% / 1s / 5pp, etc.) ne sont actuellement **soutenus par aucune donnée historique** et sont une intuition d'ingénieur avant la revue P-1. Si la télémétrie historique des 4 dernières semaines est disponible lors de la revue P-1, les lignes d'arrêt doivent être calibrées sur cette base ; sinon, les valeurs provisoires sont conservées et la règle « un seul assouplissement » ci-dessus est appliquée à la fin de P1.5.

### 0.4 Spécifications par skill (doivent être en aval · pilotées par les données)

Quel skill modifier exactement, et quel `followup_rate` viser — **non verrouillées avant que les données de la Layer 1 ne soient disponibles**.

Raison du non-verrouillage en amont : la conception a priori et les données a posteriori peuvent différer considérablement. Forcer la mise en amont répéterait l'erreur de la route D2 du `rt-optimization-design.md` §7 — l'hypothèse a priori « le modèle rapide est 2-3s plus rapide » a été contredite par le fait a posteriori de la mise en œuvre du cache, rendant le gain net de la solution proche de zéro, voire négatif.

**Emplacement de la sortie** : Les spécifications par skill sont produites à la fin de P1.5, pilotées par les données, et déclarées indépendamment dans la description de chaque PR de la Layer 2 (elles ne sont pas intégrées au document de conception, pour éviter de devoir modifier le document à chaque changement de skill).

**Template de structure des spécifications par skill** (aligné avec les éléments obligatoires de la description de PR du §4.2 — ces deux listes sont identiques, le §4.2 est la perspective du processus, cette section est la perspective des spécifications) :

| Champ                 | Contenu                                                                                                                              | Source de données                     |
| :-------------------- | :------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------ |
| 1. Données actuelles  | `invocation_count`, `followup_rate`, outils `top followup`                                                                           | Télémétrie Layer 1                    |
| 2. Objectif           | Faire passer le `followup_rate` de X% à Y%                                                                                           | Basé sur la direction d'amélioration du §0.2, la valeur absolue est déterminée dans le PR lui-même |
| 3. Périmètre de modification | Quels suivis inline (read/grep/shell read-only), spécifier clairement ce qui **n'est pas** inline (opérations write / cross-skill / raisonnement approfondi) | Tableau des modes de refonte §4.2       |
| 4. Mise à jour du contrat de sortie | Déclaration préalable ajoutée dans la description du skill (« Returns: ... »)                                                  | Exemple de refonte §3.2               |
| 5. Plan A/B           | Observer sur 2 semaines après la refonte le `followup_rate` / RT P50 / indicateurs de processus, comparer à la ligne de validation du §5.1 | §5.1                                   |
| 6. Preuve de taille   | Nombre de tokens de la description du skill avant/après la refonte (estimation avec tiktoken), ne doit pas dépasser le « Budget de taille du Skill » du §0.1 | §0.1 règle n°6                         |

### 0.5 Gouvernance des spécifications

- **Modifier les spécifications des §0.1 / §0.3** nécessite une mise à jour du document de conception + une revue de PR ; le §0.3 suit uniquement les « Règles d'ajustabilité » du §0.3 pour un assouplissement dans la fenêtre de fin de P1.5
- **Modifier le seuil du §0.2 (après verrouillage P1.5)** nécessite au moins l'une des preuves de données suivantes :
  - (a) Analyse de l'écart entre le résultat de la mesure de la baseline P1.5 et le seuil verrouillé (avec lien vers l'enregistrement de mesure original)
  - (b) Données de benchmark public pour des projets similaires (avec lien vers la source)
  - (c) Note d'explication de l'écart signée par ≥ 2 personnes en interne

  Lors de la revue de PR, si aucune de ces preuves n'est présente, le reviewer **a l'obligation** de bloquer le PR — l'« ajustement basé sur l'intuition de l'ingénieur » n'est pas accepté.

- **Les spécifications par skill du §0.4** sont écrites dans la description du PR après avoir été produites par les données (selon le template en 6 points du §0.4), et ne sont pas intégrées au document de conception.

---

## 1. Contexte et positionnement

### 1.1 Problème

Baseline donnée par `rt-optimization-design.md` §1.2 : 3 tours de boucle d'agent, 13.4s de bout en bout, dont 78% pour les appels LLM. Chaque tour ~3-4s.

```
Tour 1 (3.8s, 28%) : LLM décide d'appeler un skill
Tour 2 (3.0s, 22%) : LLM décide d'appeler shell
Tour 3 (3.8s, 28%) : LLM résume
```

Après deux cycles de revue de `rt-optimization-design.md` §6/§7, D2/D4 ont été rejetés, et D1/D3 ont été dépriorisés en « à réévaluer après les tâches superficielles ». Mais **l'ensemble du document original se concentre sur le Tour 3 final (le tour de résumé) ou sur des micro-optimisations au sein d'un seul tour (D4), sans jamais aborder directement pourquoi le Tour 1 → Tour 2 (ce « tour intermédiaire ») existe, ni s'il peut être éliminé.**

Le fait est que le Tour 2 existe **dans la grande majorité des cas parce que le skill appelé au Tour 1 n'a pas retourné de réponse complète**, ce qui oblige le modèle à ajouter une requête shell pour compléter. Si le skill est conçu pour « obtenir le résultat complet en une seule fois », on passe de 3 tours à 2 tours, économisant les ~3s du Tour 2 — c'est un gain qui ne chevauche pas du tout celui de D1.

### 1.2 Relation avec `rt-optimization-design`

| Direction de réduction des tours | Tour(s) ciblé(s)                  | Levier                        | Positionnement dans ce document                                      |
| :------------------------------- | :-------------------------------- | :---------------------------- | :-------------------------------------------------------------------- |
| D1 `skipLlmRound`                | Tour de résumé final              | Mécanisme framework + opt-in par outil | Filet de sécurité, **placé après la Layer 2**                         |
| Routage rapide D2                | Latence d'un seul tour            | Mécanisme framework          | Déjà reporté, **hors du périmètre de ce document**                    |
| État Summarizing D3              | Tour de résumé final (couche perception) | Machine d'état UI            | Optionnel, orthogonal à cette solution                                |
| Prévalidation D4                 | Latence d'un seul tour            | Mécanisme framework          | Déjà reporté, **hors du périmètre de ce document**                    |
| **Ce document : Layers 1-3**     | **Tour de décision intermédiaire + tours non déclenchés par la concurrence** | **Conception du skill + ingénierie du prompt** | **Nouvelle direction**                |

### 1.3 Thèse centrale

Le véritable levier pour réduire les tours se situe au niveau de la conception des skills/tools, et non dans le framework de l'agent. Trois raisons :

1. **La baseline du §1.2 expose déjà le problème au niveau du skill** — Le passage du Tour 1 au Tour 2 se produit uniquement parce que le skill n'a pas tout retourné. Le framework a fait ce qu'il fallait, mais le skill a échoué.
2. **La réduction des tours au niveau du framework nécessite de toute façon un opt-in par outil** — Le `skipLlmRound` de D1 doit être marqué explicitement pour chaque outil, ce qui revient à de l'ingénierie de skill, avec en plus un coût de correction d'invariants et de portes de décision.
3. **Le ROI est mesurable localement, et le déploiement progressif est facile** — Modifier un skill, c'est un tour de moins × le nombre de déclenchements de ce skill. Cela ne dépend pas des données de taux de succès du cache, ni de modifications transverses.

> **Avant la mise en œuvre, il est obligatoire de passer par la revue préalable des Spécifications de validation §0 (phase P-1, 0.5j)** — Les spécifications de couche d'ingénierie §0.1 et les lignes d'arrêt §0.3 doivent être verrouillées avant de commencer ; la direction des seuils de la couche statistique §0.2 doit également être confirmée en amont (les valeurs numériques spécifiques seront verrouillées après la baseline P1.5). Sauter le §0 pour entrer dans la mise en œuvre P0 = suivre par défaut le contre-modèle « faire d'abord, regarder les métriques ensuite », et ce document ne cautionne pas cette approche.

---

## 2. Principes de conception

1. **Ne pas modifier le framework de l'agent** — Ne pas toucher aux chemins critiques `useGeminiStream` / `coreToolScheduler` / `geminiChat`
2. **Sélectionner les priorités avec les données** — D'abord construire la télémétrie, laisser les données vous dire quel skill modifier, ne pas se fier à l'intuition
3. **Mesurable et déployable progressivement par skill** — A/B indépendant pour chaque skill, retour arrière local en cas d'échec
4. **Priorité aux intérêts composés** — Gain = gain par tour réduit × fréquence de déclenchement, les skills à haute fréquence en premier
5. **Non lié à D1** — Le succès de cette solution ne dépend pas de la mise en œuvre de D1

---

## 3. Solution en trois couches

### 3.1 Layer 1 : Télémétrie de réduction des tours (trouver la mine d'or)

**Objectif** : Laisser les données vous dire quels skills méritent le plus d'être modifiés — c'est-à-dire « après avoir utilisé ce skill, quelle est la probabilité que le modèle ajoute un appel d'outil supplémentaire ? ».

**Champs principaux** (par tour, par invocation de skill) :

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // Associe tous les événements d'un même user prompt
  turn_index: number; // Numéro du tour de ce skill dans la boucle
  followup_tool_names: string[]; // Outils encore appelés après le skill, sous le même prompt_id
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // Le tour suivant le skill produit du texte (plus d'appel d'outil)
  user_followup_within_30s: boolean; // L'utilisateur a ajouté un nouveau prompt dans les 30s suivant l'affichage du résultat (signal de régression de qualité)
}
```

**Indicateurs clés** :

- `skill_followup_rate = sum(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = sum(next_turn_is_terminal) / total_invocations`
- Agrégation par `(skill_name, top followup tool)` — voir quel outil est le plus souvent ajouté après quel skill

**Détermination de la mine d'or** :

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
Ce skill est une mine d'or pour la réduction des tours, prioritaire pour la refonte Layer 2
```

Seuil suggéré : Les top-3 skills triés par la formule ci-dessus, modifier d'abord les 2 premiers.

### 3.2 Layer 2 : Complétude de la sortie du Skill

**Objectif** : Faire en sorte que les skills identifiés comme mines d'or retournent une réponse complète en une seule fois, éliminant le saut du Tour 1 vers le Tour 2.

**Mode de refonte (par type de followup)** :

| Mode de suivi                 | Scénario typique                        | Direction de la refonte                              |
| :---------------------------- | :-------------------------------------- | :---------------------------------------------------- |
| skill → `read_file`           | skill donne le chemin, le modèle lit    | Lire directement dans le skill, retourner le contenu  |
| skill → `grep/glob`           | skill donne le répertoire, le modèle cherche | Chercher dans le skill, retourner les correspondances |
| skill → `shell` (read-only)   | skill donne la commande, le modèle exécute | Exécuter la commande dans le skill, retourner la sortie |
| skill → `shell` (write)       | skill donne la solution, le modèle exécute l'écriture | **Conserver** (l'opération d'écriture nécessite confirmation, ne pas fusionner) |
| skill → another skill         | Appel en chaîne                          | **Ne pas fusionner** (maintenir la composabilité)      |

**Liste de vérification pour la refonte (template par PR de skill)** :

1. **Déclarer le contrat de sortie** dans la description du skill : Écrire explicitement « Returns: full file content / matched lines / command output », pour que le modèle sache qu'il n'a pas besoin de requêtes supplémentaires.
2. **Effectuer tous les followups read-only** à l'intérieur du skill : Inliner les opérations de lecture/recherche qui, selon la télémétrie, ont un taux d'ajout >50%.
3. **Ne pas inliner les opérations `write`** : Les opérations d'écriture nécessitent la confirmation de l'utilisateur, elles doivent rester un tour séparé.
4. **Ne pas inliner les followups de raisonnement approfondi** : Si le followup est « sur cette base, analyse plus », c'est l'affaire du modèle, pas du skill.
5. **Joindre la télémétrie A/B** : Comparer le `followup_rate` sur 2 semaines après la refonte ; doit tomber en dessous de <20%.

**Exemple typique de refonte (illustratif)** :

Avant la refonte :

```
skill "list-workspaces" retourne : ["ws_a", "ws_b"]
→ Tour 2 : le modèle appelle shell pour obtenir les détails de chaque workspace
```

Après la refonte :

```
skill "list-workspaces" retourne :
  - ws_a (owner: foo, last_active: 2026-05-20, status: active)
  - ws_b (owner: bar, last_active: 2026-05-01, status: archived)
description mise à jour : "Returns workspaces with owner, last_active, status"
→ Le Tour 2 disparaît pour ~80% des requêtes
```

### 3.3 Layer 3 : Éduquer le modèle à la concurrence via le prompt

**Objectif** : Pour les outils indépendants (lecture de plusieurs fichiers, recherche dans plusieurs répertoires), faire en sorte que le modèle émette des `tool_calls` en concurrence dans le même tour, compressant N tours en 1 tour.

**Prérequis** : L'infrastructure est déjà prête — `CONCURRENCY_SAFE_KINDS` dans `tools/tools.ts:818` + `partitionToolCalls` dans `coreToolScheduler` peuvent déjà exécuter en concurrence les outils read/search/fetch d'un même batch. **Il manque seulement la volonté du modèle d'initier des `tool_calls` concurrentes** ; qwen-coder est par défaut plutôt séquentiel.

**Emplacement de la modification** : `packages/core/src/core/prompts.ts` (déjà audité, ajouter près de la section `# Final Reminder` L396 ne nuira à rien d'autre qu'au hit du cache — c'est juste un coût de préchauffage unique).

**Texte indicatif (illustratif, à peaufiner par A/B)** :

```
When you need to call multiple independent read-only tools (read_file,
grep, glob, web_fetch), emit them in a SINGLE tool_calls batch — do NOT
call them sequentially across rounds. They will execute concurrently.

Examples:
- Reading 3 files for comparison: emit 3 read_file calls in one batch
- Searching for 2 patterns: emit 2 grep calls in one batch

Do NOT batch when the second call depends on the first call's result.
```

**Mesure de l'effet** : Nouveau champ de télémétrie `batch_size` (nombre de `tool_calls` dans le même tour) — comparer la distribution avant et après la modification du prompt.

#### 3.3.1 Étendre `CONCURRENCY_SAFE_KINDS` (sous-élément de la Layer 3)

Éduquer le modèle à la concurrence via le prompt n'est que le côté offre (le modèle veut envoyer plusieurs `tool_calls` à la fois), mais `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` dans `tools/tools.ts:818` détermine **la portée réelle des outils pouvant s'exécuter en concurrence** : `partitionToolCalls` (`coreToolScheduler.ts:775`) regroupe les « outils consécutifs sûrs » en un batch concurrent, et exécute les autres en série.

Si le modèle suit les instructions et envoie 3 `tool_calls` d'un coup, mais que l'un d'eux est de type `Kind.Execute` et n'est pas dans l'ensemble de sécurité, tout le batch sera décomposé et exécuté en série — le gain de la modification du prompt de la Layer 3 sera annulé par l'ordonnanceur d'exécution.

**Candidats à l'extension (par risque croissant)** :

- `Kind.Think` (contenant save_memory / todo_write) — **Ne pas ajouter**, a des écritures implicites.
- Shell en lecture seule (`isShellCommandReadOnly()` retourne true pour Execute) — `partitionToolCalls` a déjà un cas spécial (`coreToolScheduler.ts` `partitionToolCalls` mentionne dans les commentaires que « Execute (shell) is safe only when isShellCommandReadOnly() returns true »), la situation actuelle est déjà couverte, pas besoin de modifier `CONCURRENCY_SAFE_KINDS`.
- Outils MCP classés par `Kind` — Le comportement des serveurs MCP varie considérablement, il faudrait un opt-in explicite à l'enregistrement de l'outil pour être sûr.

**Conclusion** : L'ensemble actuel est déjà raisonnable, **la Layer 3 ne dépend pas de l'extension de `CONCURRENCY_SAFE_KINDS`**. Le but de cette section est : après avoir collecté les données de télémétrie `batch_size`, **si l'on constate que le « P50 du batch concurrent < valeur attendue », vérifier d'abord si c'est `partitionToolCalls` qui coupe, et non le modèle qui ne fait pas de concurrence**. C'est un chemin de diagnostic en cas d'échec de l'A/B de la Layer 3, pas une étape obligatoire.

> Crédit : la review du codex a suggéré que « l'extension de `CONCURRENCY_SAFE_KINDS` est un levier négligé ». Après vérification, il a été jugé que le cas spécial `isShellCommandReadOnly` existant couvre déjà la plus grande part. Étendre l'ensemble apporte peu de gain et beaucoup de risque. Il est conservé comme chemin de diagnostic.

---

## 4. Mise en œuvre détaillée

### 4.1 Layer 1 : Extension de la télémétrie (1-2j)

#### 4.1.1 Ajouter `prompt_id` à `SkillLaunchEvent`

**Emplacement** : `packages/core/src/telemetry/types.ts:896`

Actuellement, `SkillLaunchEvent` ne contient que `skill_name` + `success`, **pas de `prompt_id`** — impossible d'associer à d'autres `ToolCallEvent` dans le même tour.

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // Nouveau
  turn_index?: number;                  // Nouveau

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // Nouveau
    turn_index?: number,                // Nouveau
  ) { ... }
}
```

**Mise à jour des appelants** : Les 4 points d'appel de `logSkillLaunch` dans `packages/core/src/tools/skill.ts` (L386, L399, L426, L482) ne peuvent pas obtenir `prompt_id` via `this.params` — `BaseToolInvocation` ne détient que `params`, pas de champ `request.prompt_id`. **Mise en œuvre réelle** : injection par typage canard : `SkillToolInvocation` expose un setter `setPromptId(id)` + un champ privé `promptId`, `CoreToolScheduler.buildInvocation` (`coreToolScheduler.ts:1253`) appelle `setPromptId(request.prompt_id)` par typage canard après la construction, s'alignant sur le pattern du hook `setCallId` existant ; l'invocation passe `this.promptId` aux 4 appels de `logSkillLaunch` dans `execute()`. **La description antérieure de cette section (« BaseToolInvocation a déjà request.prompt_id ») était erronée**, corrigée après la revue du PR #4565.

#### 4.1.1b Correction de la chaîne qwen-logger (prérequis)

Avant d'ajouter `prompt_id`, il faut d'abord résoudre un **point de rupture existant dans la chaîne** : `packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` définit la méthode `logSkillLaunchEvent(event)`, mais **aucun appelant dans l'ensemble du dépôt** — `logSkillLaunch` dans `loggers.ts:958` passe directement par `logs.getLogger(SERVICE_NAME).emit()` (le chemin OTLP), contournant qwen-logger.

Conséquences :

- Les événements skill_launch sur le chemin OTLP arrivent au collecteur OTLP (déjà fonctionnel), mais la chaîne de rapport dédiée de qwen-logger est actuellement morte.
- Si le backend de télémétrie consomme via qwen-logger (et non OTLP), les événements skill_launch **ne sont pas du tout rapportés**.
- La dérivation SQL hors ligne de `SkillFollowupRecord` (§4.1.2) dépend de la persistance de l'événement skill_launch — **il faut d'abord vérifier si l'événement skill_launch est actuellement visible sur le backend**.

Deux directions de correction possibles :

- **A** (Recommandé) Ajouter une ligne `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)` dans `logSkillLaunch` de `loggers.ts:958`, en s'alignant sur l'écriture de `logToolCall` (`loggers.ts:230`)
- **B** Confirmer que le backend ne consomme que depuis OTLP, et marquer `logSkillLaunchEvent` dans qwen-logger comme `@deprecated` ou le supprimer.

**Pourquoi n'ajouter que le chemin QwenLogger, et pas les 4 chemins complets de `logToolCall`** :

`logToolCall` (`loggers.ts:220-247`) a en fait 4 sorties :

1. `uiTelemetryService.addEvent(...)` — Affichage UI
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` — Historique de chat
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` — Télémétrie backend qwen-logger
4. OTLP `logger.emit(...)` — OpenTelemetry

skill_launch est un **événement de télémétrie purement backend**, il n'a pas besoin d'être affiché dans l'UI (l'utilisateur voit déjà le `returnDisplay` du SkillTool) ni d'entrer dans l'historique des tours du ChatRecording (les appels d'outils internes au skill sont déjà enregistrés individuellement par `recordUiTelemetryEvent`). Donc, n'ajouter que le 3ème chemin (QwenLogger) et conserver le 4ème (OTLP) est intentionnel, pas un oubli.

**Détail de la transmission des champs** : `loggers.ts:961-966` utilise le spread `{ ...event }` pour transmettre automatiquement les nouveaux champs (`prompt_id` ajouté à `SkillLaunchEvent` sera automatiquement transmis via ce chemin), mais si `logSkillLaunchEvent` dans `qwen-logger.ts:908` déstructure explicitement `event.skill_name` / `event.success` en interne, les nouveaux champs ne seront pas inclus automatiquement et devront être synchronisés manuellement.

Charge de travail : Chemin A ~0.5j (incluant la confirmation du côté backend) ; Chemin B ~0.2j (suppression de code + documentation).

#### 4.1.2 Dériver `SkillFollowupRecord` (agrégation hors ligne)

Pas besoin d'un nouveau type d'événement — `ToolCallEvent` et `SkillLaunchEvent` ont déjà `prompt_id`, une simple requête SQL hors ligne permet de le dériver :

```sql
-- Pseudo SQL, adapter au backend de télémétrie réel
WITH skill_events AS (
  SELECT prompt_id, skill_name, timestamp FROM events
  WHERE event_name = 'skill_launch' AND success = true
),
tool_events AS (
  SELECT prompt_id, function_name, timestamp FROM events
  WHERE event_name = 'tool_call'
),
followups AS (
  SELECT s.skill_name, s.prompt_id,
         COUNT(t.function_name) AS followup_count,
         ARRAY_AGG(t.function_name) AS followup_tool_names
  FROM skill_events s
  LEFT JOIN tool_events t
    ON s.prompt_id = t.prompt_id AND t.timestamp > s.timestamp
  GROUP BY s.skill_name, s.prompt_id
)
SELECT skill_name,
       COUNT(*) AS invocations,
       AVG(followup_count) AS avg_followup,
       SUM(CASE WHEN followup_count > 0 THEN 1 ELSE 0 END)::FLOAT / COUNT(*) AS followup_rate
FROM followups
GROUP BY skill_name
ORDER BY invocations * followup_rate DESC;
```

#### 4.1.3 Faire tourner la télémétrie pendant 1 semaine pour collecter les données

- Aucun changement de comportement pour l'utilisateur.
- Aucun interrupteur de configuration nécessaire — la télémétrie a déjà un cadre d'opt-in (paramètre `telemetry.target`).
- Après 1 semaine, produire un rapport de classement des skills.

### 4.2 Layer 2 : Refonte des skills (0.5-1j par skill)

Refonte du haut vers le bas selon les données de la Layer 1. Un PR indépendant par skill, la description du PR doit contenir :

1. **Données** : `invocation_count` actuel, `followup_rate`, outils `top followup`
2. **Périmètre de la refonte** : Quels suivis ont été inlinés (spécifier clairement ce qui n'est pas inliné)
3. **Mise à jour du contrat de sortie** : Quelle déclaration préalable a été ajoutée dans la description du skill
4. **Plan A/B** : observer à nouveau le `followup_rate` 2 semaines après la refonte

**Points d'attention** :

- Pour l'inline dans le skill d'opérations de lecture, ne pas réimplémenter toute la gestion des cas particuliers de `read_file` (encodage, détection binaire, etc.) — appeler l'outil `read_file` lui-même, ne pas le réécrire.
- Idem pour l'inline de grep/glob dans le skill.
- L'inline de commandes shell dans le skill doit passer par le chemin standard `executeToolCall` (pour conserver la télémétrie).
- **Ne pas faire exploser la taille du skill** : si la description du skill dépasse 500 tokens après l'inlining du followup, diviser le skill plutôt que de le fusionner.

### 4.3 Layer 3 : Éducation par prompt (0.5j de modif + optimisation par tests)

#### 4.3.1 Ajouter les instructions de concurrence

**Emplacement** : Section `# Final Reminder` de `packages/core/src/core/prompts.ts` (L396)

Ajouter le texte d'instruction de la section 3.3. Le libellé exact doit être optimisé par A/B — commencer par la version la plus simple, puis affiner en fonction de l'augmentation du taux de concurrence.

#### 4.3.2 Ajouter la télémétrie `batch_size`

**Emplacement** : `ToolCallEvent` ou nouveau `ToolBatchEvent` léger dans `packages/core/src/telemetry/types.ts`

```typescript
// Option A : Ajouter des champs à ToolCallEvent (faible intrusion)
export class ToolCallEvent {
  ...
  batch_size?: number;        // Nombre de tool_call dans le même batch
  batch_position?: number;    // Position dans le batch (indexé à partir de 0)
}

// Option B : Nouveau ToolBatchEvent (sémantique plus claire, nécessite le flux complet du nouveau type d'événement)
```

**Option A recommandée** — Faible modification, agrégation facile en requête.

**Chemin de transmission de l'état (critique — le coût de cette étape a été sous-estimé dans les premières versions)** :

`partitionToolCalls(callsToExecute)` dans `coreToolScheduler.ts:2456` retourne `batches`, **mais l'information de batch est immédiatement perdue sur le chemin d'ordonnancement** :

```
executeToolCalls
  └─ batches = partitionToolCalls(...)           // connaît batch.calls.length
     └─ for batch of batches:
        └─ this.runConcurrently(batch.calls, ...) // connaît batch.calls.length
           └─ executeSingleToolCall(call, ...)   // ❌ ne connaît plus le batch
              └─ ...
                 └─ finalizeToolCalls
                    └─ logToolCall(config, new ToolCallEvent(call)) // ❌ pas de contexte de batch
```

Le constructeur de `ToolCallEvent` (`types.ts:189`) ne reçoit qu'un seul `CompletedToolCall`, pas de champ de batch.

Directions de correction :

- **Direction A** (Recommandé) : Ajouter `batchSize?: number` + `batchPosition?: number` sur `ScheduledToolCall`. Les remplir sur deux branches :
  - Branche concurrente (`coreToolScheduler.ts:2459-2460`, `batch.calls.length > 1`) : avant d'entrer dans la boucle `runConcurrently(batch.calls, ...)`, écrire `batchSize = batch.calls.length` et `batchPosition = i` pour chaque `call`
  - Branche séquentielle (`L2462-2464` avec `for (const call of batch.calls)`) : définir explicitement `batchSize = 1` et `batchPosition = 0` pour les batchs d'un seul outil (**ne pas laisser par défaut `undefined`**, sinon l'agrégation de télémétrie en aval confondra les tours où la concurrence n'a pas eu lieu avec des données manquantes)

  `new ToolCallEvent(call)` lit ces deux champs depuis `call` dans le constructeur

- **Direction B** : Modifier la signature du constructeur de `ToolCallEvent` en `new ToolCallEvent(call, batchInfo?)`, synchroniser tous les appelants (4 points d'appel de `logToolCall` + tests). Périmètre de modification plus large que A

Charge de travail : Direction A ~0.5j avec tests unitaires ; Direction B ~1j (plus d'appelants).

**Mesure simultanée de la « volonté de concurrence du modèle »** — Avant et après la modification de `prompts.ts` (Layer 3), comparer la distribution de la « proportion de `tool_call` avec `batch_size > 1` ». C'est l'indicateur clé pour savoir si la Layer 3 est efficace. Sans ces données, l'A/B de la Layer 3 ne peut pas être conclu.

#### 4.3.3 Évaluation de l'impact sur le cache

La modification de `prompts.ts` invalidera le cache éphémère DashSpec une fois (première requête : cache miss, puis rétablissement). C'est un coût unique connu, voir l'audit de stabilité du prompt dans `rt-optimization-design.md` §7.8.

---

## 5. Validation et mesures

> **Cette section est le complément « méthodologique » des Spécifications de validation §0** — le §0 déclare « les indicateurs de succès + le moment (amont/aval) du seuil », le §5 explique « comment mesurer, comment écrire le SQL, comment concevoir l'A/B ». Les seuils de cette section sont les valeurs provisoires actuelles du §0.2 ; les valeurs finales seront verrouillées après la mesure de la baseline P1.5.

### 5.1 Indicateurs A/B par skill (2 semaines après la refonte)

| Métrique                                                    | Ligne de validation                | Remarques                                        |
| :---------------------------------------------------------- | :--------------------------------- | :----------------------------------------------- |
| `followup_rate` de ce skill                                 | < 20% (si avant c'était 70%+)      | Indicateur principal                             |
| RT P50 de bout en bout pour les scénarios déclenchant ce skill | Baisse ≥ 2s                        | Dû à un appel LLM en moins                       |
| Taux de `user_followup_within_30s` pour ce skill            | N'augmente pas                     | Pas de question de l'utilisateur = réponse complète |
| Taux de `success` de ce skill                               | Ne baisse pas                      | L'inlining du followup n'a pas introduit de nouvel échec |
### 5.2 Indicateurs globaux de RT

| Métrique                               | Baseline                                  | Objectif après modification des 3 top skills Layer 2 |
| --------------------------------------- | ----------------------------------------- | ---------------------------------------------------- |
| RT P50 de bout en bout (conversations avec skill) | 13,4 s (échantillon unique) / à compléter pour ≥3 scénarios | Réduction de 2-3 s                                  |
| Taille P50 du batch d'outils (Layer 3)  | À mesurer                                 | ≥ 1,3 (>30% des appels impliquent un batch concurrent) |
| Taux de followup total des skills (moyenne pondérée) | À mesurer                                 | Réduction ≥ 30%                                     |

### 5.3 Signaux d’échec — quand abandonner cette direction

**Seuils d’arrêt des indicateurs de résultat** :

- Après les données Layer 1, **le taux de followup pondéré des top 5 skills < 30%** → la réduction de tours est trop faible, ne vaut pas la peine de continuer vers Layer 2
- Après la modification de 2 skills en Layer 2, **la baisse du RT P50 de bout en bout < 1s** → la direction de modification est erronée (peut-être que le followup est une opération d’écriture qui ne devrait pas être fusionnée), stopper et refaire le point
- Après 2 semaines de modification du prompt Layer 3, **le P50 de batch_size est toujours = 1** → le modèle n’accepte pas les instructions de concurrence, abandonner Layer 3, ne conserver que Layer 1+2

**Seuils d’arrêt des indicateurs de processus (alerte précoce, pour éviter que la solution « semble en cours d’exécution, mais sans bénéfice réel »)** :

- **Baisse du taux de correspondance des skills (intended skill vs selected skill) ≥ 5 points de pourcentage** → la description du skill est détériorée, le modèle choisit le mauvais skill. Scénario typique : avant modification, l’utilisateur interroge X et touche toujours skill_a ; après modification, il est parfois routé vers skill_b sans générer d’erreur (le modèle utilise le mauvais skill mais produit une réponse approximative), les indicateurs de résultat semblent normaux mais le taux de followup augmente. **Méthode de mesure** : ajouter `skill_invocation_pattern` dans la télémétrie — regrouper par les N premiers mots-clés du prompt utilisateur, voir quel skill est principalement déclenché dans chaque cluster ; comparer avant/après les décalages du top 1
- **Taux d’échec des followups inline des skills ≥ 5%** → la modification du skill a introduit un mode d’échec qui n’existait pas auparavant (ex. inline `read_file` pour traiter un gros fichier entraînant un dépassement mémoire). Mesure : comparer `SkillLaunchEvent.success` avant/après
- **Augmentation du taux d’annulation par l’utilisateur (Ctrl+C) par skill ≥ 2 points de pourcentage** → la sortie du skill est plus lente ou plus longue, l’utilisateur perd patience. Mesure : proportion de `ToolCallEvent.status === 'cancelled'`

---

## 6. Articulation avec D1/D3

### 6.1 Relation avec D1

Après la modification des top skills en Layer 2, **les skills restants avec un taux de followup élevé sont les véritables cas d’usage de `skipLlmRound` de D1** — ces skills ont déjà une sortie complète (pas besoin de Round 2) et il s’agit réellement de requêtes d’état final (Round 3 pour résumé est également inutile).

Ordre d’exécution :

1. Mise en place de la télémétrie Layer 1 → 1 semaine de données
2. Modification Layer 2 des 2-3 top skills → A/B pendant 2 semaines
3. Concurrence des prompts Layer 3 → test réel 1 semaine
4. **À ce moment** évaluer D1 : parmi les skills fréquents restants, combien sont de type « sortie complète + requête d’état final » → vaut-il la peine de consacrer 2-3 jours à une modification du framework ?

### 6.2 Relation avec D3

D3 (`StreamingState.Summarizing`) est une optimisation de la couche perceptive, totalement orthogonale à cette solution. Layer 1-3 réduit le **nombre réel de tours**, D3 réduit le **temps d’attente perçu par l’utilisateur**. Si Layer 2 abaisse déjà le RT à un niveau acceptable pour l’utilisateur, la valeur de D3 diminue ; sinon, D3 peut être superposée.

---

## 7. Limites et risques connus

1. **La couverture est limitée par le périmètre de modification** — modifier 10 skills ne couvre que les scénarios de ces 10 skills. Mais les bénéfices sont mesurables et certains, avec un effet cumulatif.
2. **Les followups inline de skills peuvent alourdir un skill individuel** — description gonflée, chargement lent, réutilisabilité réduite. La check-list Layer 2, point 5, protège contre cela.
3. **En Layer 3, le modèle peut ne pas suivre les instructions de concurrence** — les données d’entraînement de qwen-coder sont plutôt séquentielles ; les données A/B peuvent montrer que la modification de prompt est inefficace, ce qui est un mode d’échec connu.
4. **Limites de confidentialité de la télémétrie** — `SkillFollowupRecord` ne doit pas enregistrer les paramètres d’outil (par défaut ils proviennent de `ToolCallEvent.function_args`, mais il faut auditer que `skill_name` ne divulgue pas l’intention de l’utilisateur).
5. **Non applicable aux sous-agents / cron / notifications** — ces chemins ne passent pas par le système de skills, cette solution ne les couvre pas.
6. **Données de base insuffisantes** — on se base sur un échantillon unique comme dans `rt-optimization-design.md` §1.2 ; avant de déployer Layer 2, il faut compléter une baseline pour ≥3 types de scénarios.
7. **L’extension des champs de `logSkillLaunch` cassera les consommateurs de télémétrie existants** — les 4 points d’appel et les logger en aval doivent être modifiés en synchronisation.
8. **`logSkillLaunchEvent` dans `qwen-logger.ts:908` est actuellement un code mort** — aucun appelant dans le dépôt ; §4.1.1b a déjà listé une correction préalable.

### 7.1 Frontières avec les mécanismes existants du framework (hors périmètre de cette solution)

Le dépôt contient déjà plusieurs mécanismes de framework indirectement liés à la réduction de tours. **Cette solution ne les réinvente pas et ne les remplace pas** :

| Mécanisme existant                                      | Emplacement                              | Relation avec cette solution                                                                                              |
| ------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently` (exécution concurrente) | `coreToolScheduler.ts:775, 2473`       | Layer 3 le réutilise directement ; cette solution ne le modifie pas                                                       |
| `CONCURRENCY_SAFE_KINDS` (définit les outils pouvant être concurrents) | `tools/tools.ts:818`                   | §3.3.1 a déjà démontré que l’état actuel est raisonnable, pas d’extension                                                  |
| `FileReadCache` (évite de relire le même fichier)       | `services/fileReadCache.ts`             | Influence indirectement les tours « modèle relit le même fichier », déjà actif ; cette solution ne dépend ni ne renforce |
| `chatCompressionService` (compression de l’historique)   | `services/chatCompressionService.ts`    | Orthogonal aux tours (impacte le coût d’un tour, pas le nombre de tours) ; c’est le même composant que le `wouldTriggerCompression` gate de la route rapide `rt-optimization-design.md` §3.2 |

Ces éléments sont listés pour éviter que cette solution soit comprise comme ignorant les mécanismes existants.

---

## 8. Calendrier de mise en œuvre

> **Prérequis : ce calendrier commence à P-1, ne peut pas être sauté**. P-1 est la revue préalable du Spec du §0, soit 0,5 j de travail mais **obligatoire** — en cas d’échec, on n’entre pas en P0. Cette contrainte évite l’anti-modèle « écrire le code puis rédiger le spec » : un spec postérieur revient à repousser le jugement « c’est un succès » après l’obtention des résultats, ce qui peut conduire à ajuster le spec pour faire bonne figure (voir l’échec de la route D2 dans `rt-optimization-design.md` §7).

| Phase   | Contenu                                                               | Investissement       | Livrable                          | Action de verrouillage spec                               |
| ------- | --------------------------------------------------------------------- | -------------------- | --------------------------------- | --------------------------------------------------------- |
| **P-1** | Revue préalable du spec                                               | 0,5 j                | §0.1 / §0.3 verrouillés           | **Verrouiller §0.1 spec couche ingénierie + §0.3 seuils d’arrêt** |
| **P0**  | Réparation de la chaîne qwen-logger (préalable §4.1.1b)               | 0,5 j                | Visibilité confirmée des événements skill_launch | Vérifier §0.1 point 1                        |
| **P1**  | Télémétrie Layer 1 : ajout du champ `prompt_id` + requête SQL hors ligne | 1-2 j                | Rapport de classement des skills   | Vérifier §0.1 points 2/3/4                  |
| **P1.5**| Collecte de données sur 1 semaine + mesures de base (≥3 scénarios × ≥10 fois) | 1 sem.         | Décision des 2-3 skills à modifier | **Verrouiller §0.2 seuils + vérifier §0.1 point 5**       |
| **P2**  | Layer 2 modification du top 1 skill (PR + A/B)                        | 0,5-1 j modif + 2 sem. observation | Vérification ↓ followup_rate, ↓ RT P50 | **Déclarer §0.4 spec par skill dans la PR**     |
| **P3**  | Couche de concurrence Layer 3 du prompt + télémétrie `batch_size` (incl. §4.3.2 passage d’état) | 1-1,5 j modif + 1 sem. test réel | Distribution de batch_size        | Vérifier §0.2 point 3                         |
| **P4**  | Poursuite modification Layer 2 des top 2 / top 3 skills (en parallèle de P3) | 0,5-1 j × N         | Baisse cumulée du RT P50           | Déclarer §0.4 dans chaque PR                           |
| **P5**  | Évaluation de la valeur restante de D1                               | Réunion de décision | Mise à jour de la feuille de route | —                                                         |

**Points de décision clés (référence aux seuils d’arrêt §0.3)** :

- **Fin de P-1** : si l’un des points §0.1 / §0.3 ne fait pas consensus → ne pas entrer en P0
- **Fin de P1.5** : si le §0.3 point 1 (taux de followup pondéré des top 5 < 30%) est déclenché → arrêter la direction ; sinon, verrouiller les seuils §0.2
- **Fin de P2** : si le §0.3 point 2 (baisse du RT P50 après modif du top 1 < 1s) ou un indicateur de processus est déclenché → stopper et refaire le point
- **Fin de P3** : si le §0.3 point 3 (batch_size P50 toujours = 1) est déclenché → abandonner Layer 3
- **P5** : décider du ROI de D1 en fonction de la morphologie des skills restants

---

## 9. Emplacements clés du code

| Fichier                                                    | Symbole clé                                                    | Emplacement                      |
| ---------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| `packages/core/src/telemetry/types.ts`                     | `ToolCallEvent` (inclut `prompt_id` / `duration_ms`)           | L170                             |
| `packages/core/src/telemetry/types.ts`                     | `SkillLaunchEvent` (nécessite l’ajout de `prompt_id`)          | L896                             |
| `packages/core/src/telemetry/loggers.ts`                   | `logToolCall`                                                  | L220                             |
| `packages/core/src/telemetry/loggers.ts`                   | `logSkillLaunch` (via OTLP ; manque le relais qwen-logger)     | L958                             |
| `packages/core/src/telemetry/loggers.ts`                   | `logToolCall` (double chemin : OTLP + qwen-logger, modèle de correction) | L220, L230         |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`   | `logSkillLaunchEvent` (**code mort actuel**, cible de correction préalable §4.1.1b) | L908 |
| `packages/core/src/core/coreToolScheduler.ts`              | `partitionToolCalls`                                           | L775                             |
| `packages/core/src/core/coreToolScheduler.ts`              | `runConcurrently` / ordonnancement batch                       | L2456, L2473                     |
| `packages/core/src/core/coreToolScheduler.ts`              | Point d’appel de `logToolCall` (terminaison du passage d’état batch_size) | L3163                |
| `packages/core/src/services/fileReadCache.ts`              | `FileReadCache` (existant, impacte les tours de relecture)     | L135                             |
| `packages/core/src/tools/skill.ts`                         | `SkillTool` + 4 points d’appel de `logSkillLaunch`             | L386, L399, L426, L482           |
| `packages/core/src/skills/skill-manager.ts`                | `SkillManager` (enregistrement/chargement des skills)          | Fichier entier                   |
| `packages/core/src/skills/skill-load.ts`                   | Chargement des descriptions de skills (point d’entrée pour les modifications du contrat de sortie) | Fichier entier |
| `packages/core/src/tools/tools.ts`                         | `Kind` + `CONCURRENCY_SAFE_KINDS`                              | L793, L818                       |
| `packages/core/src/core/coreToolScheduler.ts`              | `partitionToolCalls` + `runConcurrently` (infrastructure concurrente existante) | Voir rt-optimization-design.md §5.7 |
| `packages/core/src/core/prompts.ts`                        | Segment `# Final Reminder` (endroit où ajouter les instructions de concurrence Layer 3) | L396 |
| `.qwen/skills/`                                            | Répertoire de définition de chaque skill (cible de modification Layer 2) | Répertoire           |