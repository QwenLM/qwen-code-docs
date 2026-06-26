# Agent Loop 减轮方案：从 Skill 设计入手

> 与 `rt-optimization-design.md` 同目录，互为补充：那份文档讨论**框架机制**层面减轮（D1 跳过末尾总结轮、D2 fast 路由、D4 prevalidate），这份文档主张**减轮的真正杠杆在 skill/tool 设计层**，并提出一条不依赖框架改造、不依赖 cache hit rate 数据的可实施路径。

---

## 0. 验收 Spec（开发前置 gate）

> 本节是开发的**前置 gate** — 列出哪些 spec 必须在动手前确认、哪些 spec 须等数据驱动。把 spec 前置而非"做完再看指标"，是为了避免：(a) 写完才发现指标不可测、(b) 阈值随结果飘移导致结论失真、(c) 没设止损线让方案陷入"看起来在做、其实没收益"。
>
> **本 spec 框架的适用边界**：本框架假设方向正确性可以在 P1.5 基线测量后判断。这个假设对"减轮"场景成立，因为它有清晰的可测信号（轮数、followup_rate、batch_size）。**超出此假设的场景**（例如未来用同一框架做"质量优化"等难以量化的方向），spec 前置可能反会阻碍快速学习；遇到时回退到 §0.5 治理流程重新评估，不机械套用本框架。

**spec 分四层 — 时机不同**：

| 层级 | 类型                                    | 锁定时机                         |
| ---- | --------------------------------------- | -------------------------------- |
| §0.1 | 工程层 spec（数据管道、代码改动正确性） | **前置**、可立刻锁定             |
| §0.2 | 统计层 spec（项目"算成功"的指标）       | **前置**、阈值待 P1.5 基线后锁定 |
| §0.3 | 止损线（"如果发生就放弃"硬条件）        | **前置**、不可移动               |
| §0.4 | per-skill spec（具体改哪个、目标多少）  | **后置**、Layer 1 数据驱动       |

### 0.1 工程层 spec（必须前置 · 可立刻锁定）

数据管道与代码改动的正确性 spec — 不依赖任何业务判断或基线数据，开发前就该锁定：

- **qwen-logger 链路通畅**（§4.1.1b）：skill_launch 事件能同时落到 OTLP 和 qwen-logger 两条管道
- **`prompt_id` 串联**：单个 user prompt 触发的 `skill_launch` + 后续 `tool_call` 能用同一个 `prompt_id` grep 出完整 trail
- **`batch_size` 非 undefined**（§4.3.2 方向 A）：单工具 batch 显式设 `batch_size = 1` / `batch_position = 0`
- **SQL 可跑通**（§4.1.2）：离线 SQL 在真实 telemetry backend 输出非空且能区分高/低 followup_rate skill
- **基线方差 < P50 × 20%**（P1.5）：基线测量稳定（否则后续 A/B 对比不可信）—— 注：本条虽列在 §0.1 工程层，但**锁定依赖 P1.5 基线数据**，是 §0.1 中唯一的后置验证项；P1.5 未通过则 §0.2 阈值无法可信锁定
- **Skill 体积预算**（Layer 2 改造）：内联 followup 后，skill 描述 token 数不超过改造前的 2×，且绝对值 ≤ 500 tokens（取较小值）。超过则按 §4.2 拆分 skill 而非合并。本条与 §7 第 2 条、§4.2 已有约束对齐，前置到 spec 层
- **`npm run preflight` 全过**：每个 PR 的硬门槛

### 0.2 统计层 spec（必须前置 · 阈值待 P1.5 后锁定）

项目算"统计意义上成功"的指标 — **方向**前置定下，**阈值**等基线测出来后锁定（避免凭空填数字）：

| 指标                               | 方向     | 锁定时机  | 当前占位阈值（待校准） |
| ---------------------------------- | -------- | --------- | ---------------------- |
| top-3 skill 加权 `followup_rate`   | ↓        | P1.5 末   | ≥ 30%                  |
| 含 skill 的会话端到端 RT P50       | ↓        | P1.5 末   | ≥ 2s                   |
| `batch_size > 1` 的 tool_call 占比 | ↑        | P3 前     | ≥ 30%                  |
| 改造的 skill 触发场景 A/B 显著性   | p < 0.05 | P2 改完前 | n 待定                 |

> **关键约束**：占位阈值不是承诺。P1.5 基线如果显示"top-5 skill 加权 followup_rate < 30%"（触发 §0.3 止损线 #1），项目终止；**不能为了让阈值"达到"而下调 spec**。
>
> **怎么测**：每个指标的测量方法、SQL 模板、A/B 设计见 §5.1-§5.2；统计显著性（p < 0.05）的样本量计算见 §5.1。

### 0.3 止损线（必须前置 · P-1 锁定后受限可调）

§5.3 已列。这些是"如果发生就放弃"的硬条件 — **任何情况下不能为了达成 §0.2 统计层 spec 而放宽止损线**。

- **结果指标**（3 条）：top-5 加权 `followup_rate < 30%` / 改完 2 个 skill RT P50 ↓ < 1s / Layer 3 后 `batch_size P50` 仍 = 1
- **过程指标**（3 条）：skill 命中率 ↓ ≥ 5pp / 内联 followup 失败率 ≥ 5% / 用户取消率 ↑ ≥ 2pp

详见 §5.3。

**可调性规则**（避免无数据支撑的纪律刚性）：

| 阶段                  | 可否调整                                 | 调整方向                                                                        |
| --------------------- | ---------------------------------------- | ------------------------------------------------------------------------------- |
| P-1 锁定时            | ✅ 任意调整（基于历史 telemetry 或共识） | 任意                                                                            |
| P-1 锁定后 → P1.5 末  | ❌ 不可调整                              | —                                                                               |
| P1.5 末（基线出来时） | ✅ 仅允许**放宽**一次                    | 放宽（如 30% → 25%）需附数据证据 + 2 人评审；**不允许收紧**（避免事后追加止损） |
| P1.5 之后             | ❌ 不可调整                              | —                                                                               |

> 阈值占位值（30% / 1s / 5pp 等）当前**无历史数据支撑**，是 P-1 评审前的工程师直觉。如果 P-1 评审时能拿到最近 4 周历史 telemetry，应基于历史数据校准止损线；拿不到则保留占位值，P1.5 末执行上面的"放宽一次"规则。

### 0.4 per-skill spec（必须后置 · 数据驱动）

具体改哪个 skill、目标 `followup_rate` 改到多少 — **Layer 1 数据出来前不锁定**。

不锁定的理由：先验设计 vs 后验数据可能差很多。强行前置会重蹈 `rt-optimization-design.md` §7 D2 路线的覆辙 —— 前置假设"fast 模型快 2-3s"被 cache 实装这一后验事实推翻，导致方案净收益接近 0 甚至为负。

**产出位置**：per-skill spec 在 P1.5 末由数据驱动产出，每个 Layer 2 PR 的 description 里独立声明（不进 design 文档，避免文档每改一个 skill 就改）。

**per-skill spec 结构模板**（与 §4.2 的 PR description 必含项对齐 — 这两个清单是同一份，§4.2 是过程视角、本节是 spec 视角）：

| 字段            | 内容                                                                                                   | 数据来源                               |
| --------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------- |
| 1. 当前数据     | invocation_count、followup_rate、top followup tools                                                    | Layer 1 telemetry                      |
| 2. 目标         | followup_rate 从 X% 降到 Y%                                                                            | 基于 §0.2 改善方向，绝对值 PR 内自行定 |
| 3. 改造范围     | 内联哪些 followup（read/grep/shell read-only），明确**不**内联什么（write 操作 / 跨 skill / 深度推理） | §4.2 改造模式表                        |
| 4. 输出契约更新 | skill 描述里加的预声明（"Returns: ..."）                                                               | §3.2 改造示例                          |
| 5. A/B 计划     | 改造后 2 周观察 followup_rate / RT P50 / 过程指标，对照 §5.1 验收线                                    | §5.1                                   |
| 6. 体积证明     | 改造前后 skill 描述 token 数（用 tiktoken 估算），不得超 §0.1"Skill 体积预算"                          | §0.1 第 6 条                           |
### 0.5 Gouvernance des spécifications

- **Modifier les spécifications §0.1 / §0.3** nécessite une mise à jour du document de conception + une revue de PR ; §0.3 ne suit que la « règle d'ajustabilité » de §0.3 pour assouplir dans la fenêtre de fin P1.5
- **Modifier le seuil §0.2 (après verrouillage P1.5)** nécessite au moins l'une des preuves de données suivantes :
  - (a) Analyse de l'écart entre les résultats de mesure de la baseline P1.5 et le seuil déjà verrouillé (avec lien vers l'enregistrement de mesure original)
  - (b) Données de benchmark publiques de projets similaires (avec lien source)
  - (c) Note de déviation signée par ≥ 2 personnes en interne

  Lors de la revue PR, si aucune des preuves ci-dessus n'est fournie, le relecteur **a l'obligation** de bloquer la PR — « l'ajustement basé sur l'intuition de l'ingénieur » n'est pas accepté.

- **La spécification par compétence §0.4** est rédigée dans la description de la PR après la production pilotée par les données (selon le modèle des 6 éléments de §0.4), et n'entre pas dans le document de conception.

---

## 1. Contexte et Positionnement

### 1.1 Problème

La baseline donnée dans `rt-optimization-design.md` §1.2 : 3 tours d'agent loop, 13,4 s de bout en bout, dont 78 % pour les appels LLM. Chaque tour ~3-4 s.

```
Tour 1 (3,8 s, 28 %) : Décision LLM pour appeler une compétence
Tour 2 (3,0 s, 22 %) : Décision LLM pour appeler shell
Tour 3 (3,8 s, 28 %) : Résumé LLM
```

Après deux cycles de relecture de `rt-optimization-design.md` §6/§7, D2/D4 ont été rejetés, et D1/D3 ont été rétrogradés à « à évaluer après la finition de la couche de surface ». Mais **l'ensemble du document original se concentre sur le Tour 3 final (tour de résumé) ou sur des micro-optimisations à l'intérieur d'un seul tour (D4), sans du tout aborder directement pourquoi le Tour 1 → Tour 2 existe et s'il peut être éliminé**.

En réalité, le Tour 2 existe **dans la grande majorité des cas parce que la compétence appelée au Tour 1 n'a pas retourné de réponse complète**, ce qui pousse le modèle à ajouter un appel shell pour compléter. Si la compétence est conçue pour « obtenir le résultat complet en une fois », passer de 3 tours à 2 tours économiserait le ~3 s du Tour 2 — c'est un gain qui ne chevauche pas du tout avec D1.

### 1.2 Relation avec `rt-optimization-design`

| Direction de réduction des tours | Tour(s) ciblé(s)                | Point de levier                 | Positionnement de ce document               |
| -------------------------------- | ------------------------------- | ------------------------------- | ------------------------------------------- |
| D1 `skipLlmRound`                | Tour de résumé final            | Mécanisme cadre + opt-in par outil | Filet de sécurité, **placé après Layer 2**  |
| Routage rapide D2                | Latence d'un seul tour          | Mécanisme cadre                 | Reporté, **hors du périmètre de ce doc**   |
| État de résumé D3                | Tour de résumé final (couche perception) | Machine d'état UI     | Optionnel, orthogonal à cette solution      |
| Prévalidation D4                 | Latence d'un seul tour          | Mécanisme cadre                 | Reporté, **hors du périmètre de ce doc**   |
| **Cette solution Layer 1-3**     | **Tour de décision intermédiaire + tours non déclenchés en concurrence** | **Conception des compétences + ingénierie de prompt** | **Nouvelle direction** |

### 1.3 Argument central

Le vrai levier pour réduire les tours se trouve au niveau de la conception des compétences/outils, pas dans le cadre agent. Trois raisons :

1. **La baseline §1.2 expose déjà le problème dans la compétence** — Le saut du Tour 1 au Tour 2 se produit parce que la compétence n'a pas retourné un résultat complet ; le cadre a fait ce qu'il fallait, la compétence a fait erreur.
2. **Les réductions de tours au niveau cadre nécessitent finalement un opt-in par outil** — `skipLlmRound` de D1 doit être explicitement marqué pour chaque outil, ce qui revient à faire du travail d'ingénierie de compétence, avec en plus un coût de correction d'invariant et de contrôle de décision.
3. **Le ROI est mesurable localement et le déploiement progressif facile** — Modifier une compétence élimine un tour multiplié par la fréquence de déclenchement de cette compétence, sans dépendre des données de taux de cache hit ni des modifications intersystèmes.

> **Avant la mise en œuvre, il faut d'abord passer par la revue préalable des spécifications de validation §0 (phase P-1, 0,5 j)** — Les spécifications §0.1 au niveau ingénierie et §0.3 lignes d'arrêt doivent être verrouillées avant de commencer ; la direction du seuil statistique §0.2 doit également être confirmée en amont (les valeurs réelles seront verrouillées après la baseline P1.5). Sauter §0 pour entrer dans la mise en œuvre P0 équivaut à suivre par défaut l'anti-modèle « faire d'abord, regarder les indicateurs après » ; ce document ne cautionne pas cette approche.

---

## 2. Principes de conception

1. **Ne pas modifier le cadre agent** — Ne pas toucher au chemin critique `useGeminiStream` / `coreToolScheduler` / `geminiChat`
2. **Priorisation pilotée par les données** — D'abord construire la télémétrie, laisser les données indiquer quelle compétence modifier, pas d'intuition
3. **Mesurable et progressif par compétence** — Chaque modification de compétence A/B indépendant, retour arrière local en cas d'échec
4. **Priorité aux effets cumulatifs** — Gain = gain par réduction de tour × fréquence de déclenchement, priorité aux compétences à haute fréquence
5. **Ne pas dépendre de D1** — Le succès de cette solution ne dépend pas de l'implémentation ou non de D1

---

## 3. Solution en trois couches

### 3.1 Couche 1 : Télémétrie de réduction de tours (trouver la mine d'or)

**Objectif** : Laisser les données indiquer quelles compétences méritent le plus d'être modifiées — c'est-à-dire « après avoir utilisé cette compétence, quelle est la probabilité que le modèle ajoute un appel d'outil ? »

**Champs principaux** (par tour, par invocation de compétence) :

```typescript
interface SkillFollowupRecord {
  skill_name: string;
  prompt_id: string; // Associe tous les événements d'un même user prompt
  turn_index: number; // À quel tour dans la boucle se trouve la compétence
  followup_tool_names: string[]; // Sous le même prompt_id, quels outils ont été appelés après la compétence
  followup_count: number; // followup_tool_names.length
  followup_kinds: Kind[]; // Read/Edit/Execute/...
  next_turn_is_terminal: boolean; // Le tour suivant après la compétence produit du texte (plus d'appel d'outil)
  user_followup_within_30s: boolean; // L'utilisateur envoie un nouveau prompt dans les 30s suivant l'affichage du résultat (signal de régression de qualité)
}
```

**Indicateurs clés** :

- `skill_followup_rate = sum(followup_count > 0) / total_invocations`
- `terminal_after_skill_rate = sum(next_turn_is_terminal) / total_invocations`
- Agrégation par `(skill_name, top followup tool)` — voir quels outils sont le plus souvent ajoutés après chaque compétence

**Critère de détection de mine d'or** :

```
(invocation_count_weekly × skill_followup_rate) ≥ threshold
↓
Cette compétence est une mine d'or pour la réduction de tours, prioritaire pour la couche 2
```

Seuil suggéré : les 3 premières compétences selon la formule ci-dessus, modifier d'abord les 2 premières.

### 3.2 Couche 2 : Complétude de sortie des compétences

**Objectif** : Faire en sorte que les compétences identifiées comme mines d'or retournent une réponse complète en une fois, éliminant le saut du Tour 1 au Tour 2.

**Mode de modification (par type de suivi)** :

| Modèle de suivi               | Scénario typique                    | Direction de modification                             |
| ----------------------------- | ----------------------------------- | ----------------------------------------------------- |
| compétence → `read_file`      | La compétence donne le chemin, le modèle lit | La compétence lit directement en interne, retourne le contenu |
| compétence → `grep/glob`      | La compétence donne le répertoire, le modèle cherche | La compétence cherche en interne, retourne les correspondances |
| compétence → `shell` (lecture seule) | La compétence donne la commande, le modèle exécute | La compétence exécute la commande en interne, retourne la sortie |
| compétence → `shell` (écriture) | La compétence donne la solution, le modèle exécute l'écriture | **Conserver** (l'écriture nécessite confirmation, ne doit pas être fusionné) |
| compétence → autre compétence   | Appel en chaîne                     | **Ne pas fusionner** (préserver la composabilité)     |

**Liste de contrôle pour la modification (modèle de PR par compétence)** :

1. **Prédéclarer le contrat de sortie** dans la description de la compétence : écrire explicitement « Returns: full file content / matched lines / command output », pour que le modèle sache qu'il n'a pas besoin d'ajouter une requête
2. **Effectuer tous les suivis en lecture seule** à l'intérieur de la compétence : intégrer les opérations de lecture/recherche que la télémétrie montre avec un taux d'ajout >50 %
3. **Ne pas intégrer les opérations d'écriture** : l'écriture nécessite confirmation de l'utilisateur, doit rester un tour séparé
4. **Ne pas intégrer les suivis de raisonnement profond** : si le suivi est « analyser cela davantage », c'est le travail du modèle, pas de la compétence
5. **Joindre la télémétrie A/B** : comparer le `followup_rate` sur 2 semaines après modification pour vérifier s'il tombe en dessous de 20 %

**Exemple typique de modification (illustratif)** :

Avant modification :

```
compétence "list-workspaces" retourne : ["ws_a", "ws_b"]
→ Tour 2 : le modèle appelle shell pour obtenir les détails de chaque workspace
```

Après modification :

```
compétence "list-workspaces" retourne :
  - ws_a (propriétaire : foo, dernier accès : 2026-05-20, statut : actif)
  - ws_b (propriétaire : bar, dernier accès : 2026-05-01, statut : archivé)
description mise à jour : "Retourne les workspaces avec propriétaire, dernier accès, statut"
→ Le Tour 2 disparaît pour ~80 % des requêtes
```
### 3.3 Couche 3 : Prompt éducatif pour la concurrence du modèle

**Objectif** : Pour les outils indépendants (lecture multi-fichier, recherche multi-répertoire), faire en sorte que le modèle émette des `tool_calls` concurrents dans le même tour, réduisant N tours à 1 tour.

**Prérequis** : L'infrastructure est déjà en place — `CONCURRENCY_SAFE_KINDS` dans `tools/tools.ts:818` + `partitionToolCalls` de `coreToolScheduler` sont déjà capables d'exécuter simultanément les outils read/search/fetch d'un même batch. **Il ne manque que la volonté du modèle d'initier des `tool_calls` concurrents** ; qwen-coder est par défaut plutôt séquentiel.

**Emplacement de la modification** : `packages/core/src/core/prompts.ts` (audité, ajouter près de la section `# Final Reminder` L396 ne perturbe pas le cache, seulement un coût de préchauffage unique).

**Texte guide (indicatif, nécessite un réglage A/B)** :

```
When you need to call multiple independent read-only tools (read_file,
grep, glob, web_fetch), emit them in a SINGLE tool_calls batch — do NOT
call them sequentially across rounds. They will execute concurrently.

Examples:
- Reading 3 files for comparison: emit 3 read_file calls in one batch
- Searching for 2 patterns: emit 2 grep calls in one batch

Do NOT batch when the second call depends on the first call's result.
```

**Mesure d'efficacité** : Nouveau champ de télémétrie `batch_size` (nombre de `tool_calls` dans un même tour) — comparer les distributions avant/après la modification du prompt.

#### 3.3.1 Extension de `CONCURRENCY_SAFE_KINDS` (sous-élément de la Couche 3)

Le prompt éducatif pour la concurrence du modèle ne concerne que le côté émetteur (le modèle accepte d'envoyer plusieurs `tool_calls` à la fois), mais `CONCURRENCY_SAFE_KINDS = { Read, Search, Fetch }` dans `tools/tools.ts:818` détermine **la portée réelle des outils pouvant être exécutés simultanément** : `partitionToolCalls` (dans `coreToolScheduler.ts:775`) regroupe les « outils sécurisés consécutifs » en un batch concurrent, le reste est exécuté séquentiellement.

Si le modèle, conformément au guide, émet 3 `tool_calls` en une fois mais que l'un d'eux appartient à `Kind.Execute` et n'est pas dans l'ensemble sécurisé, l'ensemble du batch sera décomposé et exécuté séquentiellement — le gain de la modification du prompt de la Couche 3 sera annulé par l'ordonnanceur d'exécution.

**Candidats à l'extension (par risque croissant)** :

- `Kind.Think` (incluant save_memory / todo_write) — **ne pas ajouter**, écriture implicite
- Shell en lecture seule (Execute dont `isShellCommandReadOnly()` retourne true) — `partitionToolCalls` a déjà un traitement spécial (dans les commentaires de `coreToolScheduler.ts` `partitionToolCalls` : « Execute (shell) is safe only when isShellCommandReadOnly() returns true »), l'état actuel est déjà couvert, pas besoin de modifier `CONCURRENCY_SAFE_KINDS`
- Outils MCP classés par `Kind` — les comportements varient considérablement selon les serveurs MCP, un opt-in explicite est nécessaire lors de l'enregistrement pour être sûr

**Conclusion** : L'ensemble actuel est déjà raisonnable, **la Couche 3 ne dépend pas de l'extension de `CONCURRENCY_SAFE_KINDS`**. La raison de cette sous-section : après avoir collecté les données de télémétrie `batch_size`, **si le P50 des batches concurrents est inférieur à la valeur attendue, vérifier d'abord si la cause est une coupure par `partitionToolCalls` plutôt qu'un manque de concurrence du modèle**. C'est un chemin de diagnostic en cas d'échec de l'A/B de la Couche 3, pas une étape obligatoire.

> Crédit : la revue de codex a suggéré que « l'extension de `CONCURRENCY_SAFE_KINDS` est un levier ignoré ». Après vérification, le jugement est : l'état actuel couvre déjà le plus gros avec le traitement spécial `isShellCommandReadOnly`, étendre l'ensemble apporte peu de bénéfices pour un risque élevé ; à conserver comme chemin de diagnostic.

---

## 4. Mise en œuvre détaillée

### 4.1 Couche 1 : Extension de la télémétrie (1-2j)

#### 4.1.1 Ajout de `prompt_id` à `SkillLaunchEvent`

**Emplacement** : `packages/core/src/telemetry/types.ts:896`

Actuellement, `SkillLaunchEvent` ne contient que `skill_name` + `success`, **pas de `prompt_id`** — impossible de le lier aux autres `ToolCallEvent` du même tour.

```typescript
// types.ts:896
export class SkillLaunchEvent implements BaseTelemetryEvent {
  'event.name': 'skill_launch';
  'event.timestamp': string;
  skill_name: string;
  success: boolean;
  prompt_id: string;                    // ajouté
  turn_index?: number;                  // ajouté

  constructor(
    skill_name: string,
    success: boolean,
    prompt_id: string,                  // ajouté
    turn_index?: number,                // ajouté
  ) { ... }
}
```

**Mise à jour des appelants** : Les 4 points d'appel de `logSkillLaunch` dans `packages/core/src/tools/skill.ts` (L386, L399, L426, L482) — `this.params` ne permet pas d'obtenir `prompt_id` ; `BaseToolInvocation` ne contient que `params`, pas le champ `request.prompt_id`. **L'implémentation réelle** utilise une injection de style duck typing : `SkillToolInvocation` expose un setter `setPromptId(id)` + un champ privé `promptId`, et `CoreToolScheduler.buildInvocation` (dans `coreToolScheduler.ts:1253`) appelle `setPromptId(request.prompt_id)` après la construction, en suivant le pattern du hook existant `setCallId` ; les 4 `logSkillLaunch` dans `execute()` passent tous `this.promptId`. **La description antérieure de cette section (« BaseToolInvocation a déjà request.prompt_id ») était erronée**, corrigée après la revue de la PR #4565.

#### 4.1.1b Correction du pipeline qwen-logger (prérequis)

Avant d'ajouter `prompt_id`, il faut d'abord résoudre un **point de rupture existant dans le pipeline** : `packages/core/src/telemetry/qwen-logger/qwen-logger.ts:908` définit la méthode `logSkillLaunchEvent(event)`, mais **aucun appelant dans l'ensemble du dépôt** — `logSkillLaunch` dans `loggers.ts:958` passe directement par la voie OTLP avec `logs.getLogger(SERVICE_NAME).emit()`, contournant qwen-logger.

Conséquences :

- Les événements skill_launch sur la voie OTLP atteignent le collecteur OTLP (déjà fonctionnel), mais le pipeline dédié de qwen-logger est actuellement mort
- Si le backend de télémétrie consomme depuis qwen-logger (et non OTLP), les événements skill_launch **ne sont pas du tout remontés**
- La dérivation SQL hors ligne de `SkillFollowupRecord` (§4.1.2) dépend de l'enregistrement des événements skill_launch — **il faut d'abord vérifier si skill_launch est visible dans le backend actuellement**

Deux options de correction :

- **A** (recommandé) : Ajouter une ligne `QwenLogger.getInstance(config)?.logSkillLaunchEvent(event)` dans `logSkillLaunch` de `loggers.ts:958`, en alignement avec l'écriture de `logToolCall` dans `loggers.ts:230`
- **B** : Confirmer que le backend ne consomme que depuis OTLP, puis marquer `logSkillLaunchEvent` dans qwen-logger comme `@deprecated` ou le supprimer

**Pourquoi ne compléter que la voie QwenLogger, sans aligner les 4 chemins complets de `logToolCall`** :

`logToolCall` (dans `loggers.ts:220-247`) a en fait 4 sorties :

1. `uiTelemetryService.addEvent(...)` — affichage UI
2. `config.getChatRecordingService()?.recordUiTelemetryEvent(...)` — historique de chat
3. `QwenLogger.getInstance(config)?.logToolCallEvent(...)` — télémétrie backend qwen-logger
4. OTLP `logger.emit(...)` — OpenTelemetry

skill_launch est un **événement de télémétrie purement backend** : il n'a pas besoin d'être affiché dans l'UI (l'utilisateur voit déjà le returnDisplay de SkillTool) ni d'entrer dans l'historique des tours de ChatRecording (les appels d'outils internes au skill sont déjà enregistrés individuellement par recordUiTelemetryEvent). Donc ne compléter que la 3ème voie (QwenLogger), conserver la 4ème (OTLP), et sauter les voies 1/2 est intentionnel, pas une omission.

**Détails de transmission des champs** : Dans `loggers.ts:961-966`, l'utilisation du spread `{ ...event }` transmet automatiquement les nouveaux champs (après ajout de `prompt_id` à `SkillLaunchEvent`, ce chemin fonctionne automatiquement), mais dans `qwen-logger.ts:908`, la méthode `logSkillLaunchEvent` extrait explicitement `event.skill_name` / `event.success` ; les nouveaux champs ne seront pas inclus automatiquement, une synchronisation manuelle est nécessaire.

Charge de travail : Chemin A environ 0,5j (incluant la confirmation côté backend) ; Chemin B environ 0,2j (suppression de code + documentation).

#### 4.1.2 Dérivation de `SkillFollowupRecord` (agrégation hors ligne)
Pas besoin de nouveau type d'événement — `ToolCallEvent` et `SkillLaunchEvent` intègrent déjà `prompt_id` ; une simple requête SQL hors ligne suffit pour dériver les données :

```sql
-- Pseudo-SQL, à ajuster selon le backend de télémétrie
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

#### 4.1.3 Exécuter la télémétrie pendant 1 semaine pour collecter les données

- Aucun changement du comportement visible par l'utilisateur
- Aucun commutateur de configuration nécessaire — la télémétrie dispose déjà d'un cadre opt-in (paramètre `telemetry.target`)
- Après 1 semaine, produire un rapport de classement des skills

### 4.2 Layer 2 : Refonte des skills (0,5 à 1 jour par skill)

Refaire les skills du haut vers le bas en se basant sur les données du Layer 1. Chaque skill fait l'objet d'une PR indépendante ; la description de la PR doit contenir :

1. **Données** : invocation_count actuel, followup_rate, principaux outils de suivi
2. **Périmètre de la refonte** : quels followup ont été intégrés (et explicitement ce qui ne l'est pas)
3. **Mise à jour du contrat de sortie** : quelles déclarations préalables ont été ajoutées à la description du skill
4. **Plan A/B** : observer à nouveau le followup_rate 2 semaines après la refonte

**Remarques importantes** :

- Lors de l'intégration d'une opération read dans un skill, ne pas reproduire toute la gestion des cas limites de `read_file` (encodage, détection binaire, etc.) — appeler l'outil `read_file` lui-même, ne pas le réécrire
- Même principe pour l'intégration de grep/glob dans un skill
- Les commandes shell intégrées dans un skill doivent passer par le chemin standard `executeToolCall` (en conservant la télémétrie)
- **Ne pas laisser le volume du skill exploser** : si après intégration des followup la description du skill dépasse 500 tokens, diviser le skill plutôt que de tout fusionner

### 4.3 Layer 3 : Éducation par le prompt (0,5 j de modifications + réglages empiriques)

#### 4.3.1 Ajouter des instructions sur la simultanéité

**Emplacement** : `packages/core/src/core/prompts.ts` section `# Final Reminder` (L396)

Ajouter le texte d'instructions de la section 3.3. Le libellé exact doit être déterminé par A/B — commencer par la version la plus simple, puis affiner en fonction du taux d'amélioration de la simultanéité.

#### 4.3.2 Ajouter la télémétrie `batch_size`

**Emplacement** : `ToolCallEvent` dans `packages/core/src/telemetry/types.ts` ou un nouveau `ToolBatchEvent` léger

```typescript
// Option A : ajouter un champ à ToolCallEvent (faible intrusion)
export class ToolCallEvent {
  ...
  batch_size?: number;        // nombre de tool_call dans le même batch
  batch_position?: number;    // position dans le batch (indexé à partir de 0)
}

// Option B : nouveau ToolBatchEvent (sémantique plus claire, nécessite le processus complet de nouveau type d'événement)
```

**Option A recommandée** — peu de modifications, agrégation facile en requête.

**Chemin de transmission de l'état** (crucial — cette étape a été sous-estimée dans les versions antérieures) :

`partitionToolCalls(callsToExecute)` à `coreToolScheduler.ts:2456` retourne `batches`, **mais l'information de batch est immédiatement perdue sur le chemin de planification** :

```
executeToolCalls
  └─ batches = partitionToolCalls(...)           // connaît batch.calls.length
     └─ for batch of batches:
        └─ this.runConcurrently(batch.calls, ...) // connaît batch.calls.length
           └─ executeSingleToolCall(call, ...)   // ❌ ne connaît plus le batch
              └─ ...
                 └─ finalizeToolCalls
                    └─ logToolCall(config, new ToolCallEvent(call)) // ❌ pas de contexte batch
```

Le constructeur de `ToolCallEvent` (`types.ts:189`) ne reçoit qu'un seul `CompletedToolCall`, sans champ de batch.

Direction de correction :

- **Direction A** (recommandée) : ajouter `batchSize?: number` + `batchPosition?: number` à `ScheduledToolCall`. Remplir dans les deux branches :
  - Branche concurrente (`coreToolScheduler.ts:2459-2460`, `batch.calls.length > 1`) : avant d'entrer dans `runConcurrently(batch.calls, ...)`, écrire `batchSize = batch.calls.length`, `batchPosition = i` pour chaque `call` dans le batch
  - Branche séquentielle (`L2462-2464` `for (const call of batch.calls)`) : pour un batch à un seul outil, définir explicitement `batchSize = 1`, `batchPosition = 0` (**ne pas laisser `undefined`**, sinon l'agrégation télémétrique en aval interpréterait les tours où la concurrence n'a pas eu lieu comme des données manquantes)

  `new ToolCallEvent(call)` lit ces deux champs depuis `call` dans le constructeur

- **Direction B** : modifier la signature du constructeur de `ToolCallEvent` en `new ToolCallEvent(call, batchInfo?)`, et mettre à jour tous les appelants (4 points d'appel de `logToolCall` + tests). Surface de modification plus grande que A

Charge de travail : Direction A environ 0,5 j avec tests unitaires ; Direction B environ 1 j (plus d'appelants).

**Mesurer la « volonté de concurrence » du modèle** — avant et après la modification de `prompts.ts` dans Layer 3, comparer la distribution de `proportion de tool_call avec batch_size > 1`. C'est l'indicateur clé de l'efficacité du Layer 3 ; sans ces données, l'A/B du Layer 3 ne peut pas être conclu.

#### 4.3.3 Évaluation de l'impact sur le cache

La modification de `prompts.ts` invalidera entièrement le cache éphémère de DashScope (première requête : cache miss, puis rétablissement). C'est un coût unique connu, voir §7.8 du document `rt-optimization-design.md` sur l'audit de stabilité du prompt.

---

## 5. Validation et métriques

> **Cette section est le complément « méthodologique » du cahier des charges de validation §0** — §0 déclare « indicateurs de succès + seuils et moments avant/après », §5 explique « comment mesurer, comment écrire les requêtes SQL, comment concevoir l'A/B ». Les seuils de cette section sont les placeholders actuels de §0.2 ; les valeurs finales seront verrouillées après la mesure de la baseline P1.5.

### 5.1 Indicateurs A/B par skill (2 semaines après refonte)

| Indicateur                                  | Seuil de validation         | Remarque                        |
| ------------------------------------------- | --------------------------- | ------------------------------- |
| `followup_rate` du skill                    | < 20 % (si avant > 70 %)    | Indicateur principal            |
| P50 du temps de réponse de bout en bout dans le scénario déclenché par ce skill | Baisse ≥ 2 s | Grâce à un appel LLM en moins   |
| Taux de `user_followup_within_30s` du skill | Pas d'augmentation          | Pas de relance = réponse complète |
| Taux de `success` du skill                  | Pas de baisse               | L'intégration des followup n'introduit pas de nouveaux échecs |

### 5.2 Indicateurs globaux de temps de réponse

| Indicateur                            | Baseline                                   | Objectif après refonte des 3 meilleurs skills du Layer 2 |
| ------------------------------------- | ------------------------------------------ | -------------------------------------------------------- |
| P50 du temps de réponse de bout en bout (sessions avec skill) | 13,4 s (échantillon unique) / à compléter baseline sur ≥3 catégories de scénarios | Baisse de 2 à 3 s            |
| P50 de la taille des tool batches (Layer 3) | À mesurer                                  | ≥ 1,3 (plus de 30 % des appels impliquant des batchs concurrents) |
| `followup_rate` total des skills (moyenne pondérée) | À mesurer                                  | Baisse ≥ 30 %                |
### 5.3 Signaux d'échec — quand abandonner cette direction

**Seuils d'arrêt sur résultats** :

- Après les données de Layer 1, **le `followup_rate` pondéré des top-5 skills < 30 %** → la marge de réduction de tours est faible, ne vaut pas la peine de continuer en Layer 2
- Après la modification de 2 skills en Layer 2, **la baisse du RT P50 de bout en bout < 1 s** → la direction de transformation est erronée (peut-être que le followup est une opération d'écriture qui ne devrait pas être fusionnée), arrêtez et faites le point
- Après 2 semaines de modification du prompt en Layer 3, **le `batch_size` P50 vaut toujours 1** → le modèle n'accepte pas les instructions de concurrence, abandonnez Layer 3, ne conservez que Layer 1 + 2

**Seuils d'arrêt sur processus (alerte précoce pour éviter que la solution « ait l'air de faire quelque chose mais ne rapporte rien »)** :

- **Baisse du taux de correspondance des skills (skill prévu vs skill sélectionné) ≥ 5 pp** → la description du skill a été mal modifiée, ce qui fait que le modèle choisit le mauvais skill. Scénario typique : avant la transformation, l'utilisateur demandait X et tombait toujours sur skill_a ; après transformation, il est parfois routé vers skill_b sans générer d'erreur (le modèle utilise le mauvais skill mais produit une réponse approximative), les résultats semblent normaux mais le `followup_rate` augmente. **Méthode de mesure** : ajouter `skill_invocation_pattern` dans la télémétrie – regrouper par les N premiers mots-clés du prompt utilisateur et observer quel skill est principalement déclenché par chaque cluster ; comparer le décalage du top 1 avant/après transformation
- **Taux d'échec des followups internes aux skills ≥ 5 %** → la transformation du skill a introduit un mode d'échec qui n'existait pas auparavant (par exemple, un `read_file` interne qui gère un fichier volumineux fait exploser la mémoire). Mesure : comparer `SkillLaunchEvent.success` avant/après transformation
- **Augmentation du taux d'annulation utilisateur (Ctrl + C) par skill ≥ 2 pp** → la sortie du skill est devenue plus lente ou plus longue, ce qui fait perdre patience à l'utilisateur. Mesure : proportion de `ToolCallEvent.status === 'cancelled'`

---

## 6. Articulation avec D1/D3

### 6.1 Relation avec D1

Après la transformation des top skills en Layer 2, **les skills restants avec beaucoup de followups sont le véritable scénario d'application de D1 `skipLlmRound`** – ces skills produisent déjà une sortie complète (pas besoin de Round 2) et ce sont bien des requêtes terminales (Round 3 de résumé est également inutile).

Ordre d'exécution :

1. Mise en production de la télémétrie Layer 1 → 1 semaine de données
2. Transformation de 2-3 top skills en Layer 2 → A/B pendant 2 semaines
3. Instructions de concurrence dans le prompt Layer 3 → tests réels pendant 1 semaine
4. **À ce moment-là**, évaluer D1 : parmi les skills fréquents restants, combien ont la forme « sortie complète + requête terminale » → est-ce que cela vaut 2-3 jours de transformation du framework

### 6.2 Relation avec D3

D3 (`StreamingState.Summarizing`) est une optimisation de la couche perceptive, totalement orthogonale à cette proposition. Layer 1-3 réduit le **nombre réel de tours**, D3 réduit le **temps d'attente perçu par l'utilisateur**. Si Layer 2 a déjà réduit le RT à un niveau acceptable pour l'utilisateur, la valeur de D3 diminue ; sinon, D3 peut être ajouté en superposition.

---

## 7. Limitations et risques connus

1. **Couverture limitée par le périmètre de transformation** — modifier 10 skills ne couvre que les scénarios de ces 10 skills. Mais le gain est déterminé, mesurable et cumulatif
2. **Les followups internes aux skills peuvent alourdir un skill** — description gonflée, chargement lent, réutilisabilité réduite. La vérification n°5 de la checklist Layer 2 protège contre cela
3. **Le modèle Layer 3 peut ne pas suivre les instructions de concurrence** — les données d'entraînement de qwen-coder sont plutôt séquentielles ; les données A/B peuvent montrer que la modification du prompt est inefficace, ce qui est un mode d'échec connu
4. **Limites de confidentialité de la télémétrie** — `SkillFollowupRecord` ne doit pas enregistrer les paramètres des outils (déjà par défaut depuis `ToolCallEvent.function_args`, mais il faut auditer si `skill_name` ne divulgue pas l'intention de l'utilisateur)
5. **Non applicable aux sous-agents / cron / notifications** — ces chemins n'utilisent pas le système de skills, cette proposition ne les couvre pas
6. **Données de base insuffisantes** — on utilise le même échantillon unique du §1.2 de `rt-optimization-design.md` ; avant de mettre en œuvre Layer 2, il faut compléter les données de base avec ≥3 types de scénarios
7. **L'extension du champ `logSkillLaunch` casse les consommateurs de télémétrie existants** — 4 points d'appel + le logger aval doivent tous être modifiés en synchronisation
8. **`qwen-logger.ts:908` `logSkillLaunchEvent` est actuellement du code mort** — aucun appelant dans le dépôt, la réparation préalable est listée au §4.1.1b

### 7.1 Frontières avec les mécanismes du framework existant (hors domaine de cette proposition)

Le dépôt dispose déjà de plusieurs mécanismes indirectement liés à la réduction de tours. **Cette proposition ne les réinvente pas et ne les remplace pas** :

| Mécanisme existant                                    | Emplacement                             | Relation avec cette proposition                                                                                                                 |
| ----------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `partitionToolCalls` + `runConcurrently` (exécution concurrente) | `coreToolScheduler.ts:775, 2473`        | Layer 3 le réutilise directement ; cette proposition ne le modifie pas                                                                          |
| `CONCURRENCY_SAFE_KINDS` (détermine quels outils peuvent être concurrents) | `tools/tools.ts:818`                    | §3.3.1 a déjà argumenté que l'état actuel est raisonnable, pas d'extension                                                                      |
| `FileReadCache` (évite de relire le même fichier)     | `services/fileReadCache.ts`             | Influence indirectement les tours où le modèle relit un fichier, déjà actif ; cette proposition ne dépend pas de lui et ne l'améliore pas       |
| `chatCompressionService` (compression de l'historique) | `services/chatCompressionService.ts`    | Orthogonal aux tours (affecte le coût par tour, pas le nombre de tours) ; même composant que le gate `wouldTriggerCompression` de la route fast du §3.2 de `rt-optimization-design.md` |

Ces éléments sont listés pour éviter que cette proposition ne soit comprise comme ignorant les mécanismes existants.

---

## 8. Calendrier de mise en œuvre

> **Prérequis : ce calendrier commence à P-1 et ne peut être sauté**. P-1 est la revue préalable du spec de validation du §0, 0,5 j de travail mais **obligatoire** — sans approbation, on ne passe pas à P0. Cette contrainte vise à éviter l'anti-modèle « écrire le code d'abord, puis compléter le spec » : un spec postposé revient à reporter le jugement de « succès » après les résultats, ce qui crée un biais d'ajustement du spec pour faire bonne figure (voir l'erreur de la route D2 dans `rt-optimization-design.md` §7).

| Phase    | Contenu                                                                | Investissement       | Livrable                          | Action de verrouillage du spec                |
| -------- | ---------------------------------------------------------------------- | -------------------- | --------------------------------- | --------------------------------------------- |
| **P-1**  | Revue préalable du spec                                                | 0,5 j                | Verrouillage §0.1 / §0.3          | **Verrouiller le spec couche ingénierie §0.1 + seuils d'arrêt §0.3** |
| **P0**   | Réparation de la chaîne qwen-logger (prérequis §4.1.1b)                | 0,5 j                | Confirmation de visibilité des événements skill_launch | Vérifier §0.1 point 1                     |
| **P1**   | Télémétrie Layer 1 : ajout du champ `prompt_id` + SQL hors ligne       | 1-2 j                | Rapport de classement des skills   | Vérifier §0.1 points 2/3/4                  |
| **P1.5** | Collecte de données sur 1 semaine + mesures de base (≥3 scénarios × ≥10 fois) | 1 semaine            | Décision des 2-3 skills à modifier | **Verrouiller les seuils §0.2 + vérifier §0.1 point 5** |
| **P2**   | Transformation Layer 2 du top-1 skill (PR + A/B)                       | 0,5-1 j de transformation + 2 semaines d'observation | Vérification de la baisse du `followup_rate` et du RT P50 | **Déclarer le spec par skill §0.4 dans le PR** |
| **P3**   | Instructions de concurrence dans le prompt Layer 3 + télémétrie `batch_size` (incluant le passage d'état §4.3.2) | 1-1,5 j de modification + 1 semaine de tests | Distribution de `batch_size`      | Vérifier §0.2 point 3                       |
| **P4**   | Poursuite de la transformation Layer 2 des top-2 / top-3 skills (en parallèle de P3) | 0,5-1 j × N         | Baisse cumulative du RT P50       | Déclarer §0.4 dans chaque PR                |
| **P5**   | Évaluation de la valeur résiduelle de D1                               | Réunion de décision  | Mise à jour de la feuille de route | —                                           |
**Points de décision clés (réf. au §0.3 lignes de stop)** :

- **Fin P-1** : Si l'un des §0.1 / §0.3 ne fait pas consensus → ne pas entrer dans P0
- **Fin P1.5** : Si le critère de résultat #1 du §0.3 est déclenché (top-5 followup_rate pondéré < 30%) → arrêter la direction ; sinon verrouiller le seuil du §0.2
- **Fin P2** : Si le critère de résultat #2 du §0.3 est déclenché (RT P50 après transformation top-1 ↓ < 1s) ou tout indicateur de processus → faire une pause et revoir
- **Fin P3** : Si le critère de résultat #3 du §0.3 est déclenché (batch_size P50 toujours = 1) → abandonner la couche 3
- **P5** : Déterminer le retour sur investissement (ROI) de D1 en fonction de la forme restante de la skill

---

## 9. Emplacements clés du code

| Fichier                                                                               | Symbole clé                                                                                           | Emplacement                              |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| `packages/core/src/telemetry/types.ts`                                                | `ToolCallEvent` (contenant `prompt_id` / `duration_ms`)                                              | L170                                     |
| `packages/core/src/telemetry/types.ts`                                                | `SkillLaunchEvent` (doit compléter `prompt_id`)                                                      | L896                                     |
| `packages/core/src/telemetry/loggers.ts`                                              | `logToolCall`                                                                                         | L220                                     |
| `packages/core/src/telemetry/loggers.ts`                                              | `logSkillLaunch` (passe par OTLP ; manque le transfert qwen-logger)                                  | L958                                     |
| `packages/core/src/telemetry/loggers.ts`                                              | `logToolCall` (double chemin : OTLP + qwen-logger, servant de modèle de correction)                  | L220, L230                               |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                              | `logSkillLaunchEvent` (**code mort actuel**, cible de correction préalable du §4.1.1b)                | L908                                     |
| `packages/core/src/core/coreToolScheduler.ts`                                         | `partitionToolCalls`                                                                                  | L775                                     |
| `packages/core/src/core/coreToolScheduler.ts`                                         | `runConcurrently` / ordonnancement batch                                                             | L2456, L2473                             |
| `packages/core/src/core/coreToolScheduler.ts`                                         | point d'appel `logToolCall` (point final de passage de l'état batch_size)                            | L3163                                    |
| `packages/core/src/services/fileReadCache.ts`                                         | `FileReadCache` (existant, impacte les cycles de lecture répétée)                                    | L135                                     |
| `packages/core/src/tools/skill.ts`                                                    | `SkillTool` + 4 points d'appel `logSkillLaunch`                                                      | L386, L399, L426, L482                   |
| `packages/core/src/skills/skill-manager.ts`                                           | `SkillManager` (enregistrement/chargement des skills)                                                | Fichier entier                           |
| `packages/core/src/skills/skill-load.ts`                                              | Chargement de la description des skills (point d'entrée pour les modifications de contrat de sortie) | Fichier entier                           |
| `packages/core/src/tools/tools.ts`                                                    | `Kind` + `CONCURRENCY_SAFE_KINDS`                                                                    | L793, L818                               |
| `packages/core/src/core/coreToolScheduler.ts`                                         | `partitionToolCalls` + `runConcurrently` (infrastructure de concurrence existante)                   | Voir rt-optimization-design.md §5.7      |
| `packages/core/src/core/prompts.ts`                                                   | Section `# Final Reminder` (endroit où ajouter les directives de concurrence pour la couche 3)       | L396                                     |
| `.qwen/skills/`                                                                       | Répertoire de définitions de chaque skill (objet de transformation de la couche 2)                   | Répertoire                               |
