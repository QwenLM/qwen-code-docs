# Qwen Code Agent Loop RT – Plan d'optimisation technique

## 1. Contexte et définition du problème

### 1.1 État actuel

La boucle d'agent de Qwen Code suit un modèle strictement séquentiel :

```
User Prompt → [Décision LLM] → Exécution d'outil → [Décision LLM] → Exécution d'outil → ... → [Réponse LLM] → Inactif
               ~3-4s                ~Xms-Ns            ~3-4s                ~Xms-Ns              ~3-4s
```

Chaque appel LLM (incluant le RTT réseau + l'inférence du modèle) prend environ 3 à 4 secondes, représentant le coût principal du temps de réponse de bout en bout.

### 1.2 Données mesurées

Scénario de test : « Quels espaces de travail ai-je ? » (3 tours de boucle agent, 2 appels d'outil, échantillon unique)

| Phase                               | Durée    | Pourcentage |
| ----------------------------------- | -------- | ----------- |
| Tour LLM 1 (décision d'appeler skill) | 3,8 s    | 28%         |
| Exécution Skill                     | 1 ms     | <1%         |
| Tour LLM 2 (décision d'appeler shell) | 3,0 s    | 22%         |
| Exécution Shell                     | 2,5 s    | 19%         |
| Tour LLM 3 (résumé textuel)         | 3,8 s    | 28%         |
| Surcharge framework (sync état, rendu) | 0,3 s | 3%          |
| **Total**                           | **13,4 s** | **100%**    |

**Conclusion** : Les appels LLM représentent 78 %, l'exécution des outils 19 %, le framework 3 %. L'optimisation consiste principalement à **réduire le nombre d'appels LLM** et à **diminuer la latence de chaque appel LLM**.

> Remarque : Échantillon unique, scénario unique. Les 19 % d'exécution outil sont dominés par un appel shell lent ; dans les scénarios fortement axés sur la lecture, l'exécution outil peut descendre en dessous de 5 %. Avant de mettre en œuvre le plan, il est nécessaire de compléter une référence avec ≥3 types de scénarios (opérations d'écriture, raisonnement multi-outil, reprise sur erreur).

### 1.3 Contraintes clés de l'architecture actuelle

| Contrainte                       | Emplacement dans le code                                                                                          | Explication                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Aucun contrôle post-exécution sur les résultats d'outil | `tools.ts` interface `ToolResult` (L422)                                                                          | Seulement `llmContent`/`returnDisplay`/`error` – impossible d'exprimer « ignorer LLM »       |
| Résultats systématiquement renvoyés au LLM | `useGeminiStream.ts` `handleCompletedTools` (L2038) → `submitQuery(ToolResult, …)` (L2355)                           | Tous les résultats d'outil initiés par Gemini sont renvoyés                                  |
| Ordonnancement uniquement après la fin du stream | `useGeminiStream.ts` `processGeminiStreamEvents` (L1365)                                                           | L'ordonnancement `scheduleToolCalls` n'a lieu qu'après la boucle stream – pas d'ordonnancement incrémental |
| Sélection de modèle sans couche de stratégie | `client.ts` `modelOverride ?? getModel()` (L1305, L1598)                                                             | L'infrastructure est déjà câblée jusqu'à `turn.run(model, …)` (L1707), mais l'appelant ne l'utilise que lorsqu'un skill le spécifie explicitement |

### 1.4 Infrastructure déjà prête (largement réutilisée par ce plan)

| Capacité                                                     | Emplacement                                                                | État actuel                                                                                          |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Configuration `fastModel` + `/model --fast <id>`             | `config.ts:684`, `1987`, `2021`                                               | Prêt                                                                                                 |
| `SendMessageOptions.modelOverride`                           | `client.ts:142` → `1598` → `turn.run`                                         | Câblé de bout en bout jusqu'à `geminiChat.sendMessageStream(model, …)`                               |
| Couche hook `modelOverrideRef` (pour la sélection du modèle par skill) | `useGeminiStream.ts:376`, `2225`, `1841`                                        | Câblé                                                                                                |
| Précédent de requête side non‑streaming avec fast‑model      | `services/toolUseSummary.ts:108` (via `runSideQuery`)                          | Déjà en production, preuve que la configuration fast‑model est fiable ; mais **voie non‑streaming**  |
| Précédent de **streaming** avec fast‑model                   | `followup/speculation.ts:224`                                                  | Déjà en production, mais utilise un **chat forké** (`createForkedChat`), isolé du chat principal     |

**Lacune critique** : **Aucun code en production** n'exécute de streaming avec un modèle rapide sur le chat principal. La phase D2 de ce plan sera le premier cas – une expérience de validation préalable est nécessaire (voir §3.2 Conditions préalables).

---

## 2. Principes de conception

1. **Généralité** : La solution n'est pas liée à un outil ou skill spécifique
2. **Rétrocompatibilité** : Les outils existants fonctionnent sans modification
3. **Progressivité + signal explicite** : La stratégie est conservatrice par défaut ; l'optimisation est activée par les auteurs d'outils via des champs explicites
4. **Réversibilité** : Toutes les optimisations sont contrôlées par des feature flags ; possibilité de désactivation forcée au niveau utilisateur
5. **Compromis honnêtes** : Mention claire des risques de qualité, des coûts et des limites d'applicabilité

---

## 3. Plan d'optimisation

### 3.1 Direction 1 : Directive post-exécution sur le résultat d'outil (ToolResult Post-Execution Directive)

#### Problème

Actuellement, `ToolResult` ne contient aucune information sur « la suite à donner ». Quel que soit le caractère auto‑explicatif du résultat, un tour LLM est systématiquement déclenché.

#### Conception

Étendre l'interface `ToolResult` (`packages/core/src/tools/tools.ts` L422) :

```typescript
export interface ToolResult {
  llmContent: PartListUnion;
  returnDisplay: ToolResultDisplay;
  error?: { message: string; type?: ToolErrorType };

  // Nouveau : directive post-exécution
  postExecution?: {
    /**
     * Le résultat de l'outil n'est pas renvoyé au LLM, il est directement affiché
     * comme réponse finale à l'utilisateur.
     * Convient lorsque le résultat est totalement auto-contenu et ne nécessite
     * pas de réinterprétation par le modèle.
     * Propriété locale au ToolResult.
     */
    skipLlmRound?: boolean;

    /**
     * Le résultat de l'outil est « auto-contenu et directement présentable à l'utilisateur »
     * – c'est-à-dire que `returnDisplay` est déjà la forme finale souhaitée par l'utilisateur,
     * sans besoin de traitement par le modèle.
     * Propriété locale au ToolResult, **ne prédit pas** si « le prochain tour sera un résumé ».
     * En interaction avec la direction 3 (découplage affichage) : true → passage en état
     * « Summarizing » permettant la saisie utilisateur.
     */
    resultIsTerminal?: boolean;
  };
}
```

> **Correction de conception** : Les premières versions utilisaient un champ unique `selfExplanatory` pour porter à la fois « la propriété du résultat d'outil » et « le signal de prédiction du flux de dialogue », mais ces deux rôles ne se recoupent pas (exemple : l'utilisateur demande « lis X puis modifie Y », la sortie de read_file est auto‑contenue, mais le tour suivant n'est clairement pas un résumé). **Le signal de prédiction appartient aux attributs globaux du flux de dialogue** et ne doit pas être exprimé via un champ d'outil – D2 utilisera exclusivement une heuristique de flux (voir §3.2).

#### Changement de comportement

Ajout d'une vérification dans `handleCompletedTools` :

```
Fin d'un lot d'outils
  → Vérifier `postExecution.skipLlmRound` pour tous les outils du lot
  → Tous à true ?
    → OUI : `markToolsAsSubmitted`, ne pas appeler `submitQuery`, passer directement à inactif
    → NON : conserver le comportement actuel (`submitQuery`)
```

**Contrainte importante** : `skipLlmRound` n'est effectif que si **tous les outils du lot actuel déclarent skip**. Un lot mixte conserve le comportement actuel de renvoi.

#### Invariant historique

Après avoir sauté le LLM, l'historique prend la forme : `user → function_call → function_response → <pas d'assistant>`.

- Vérifier que `repairOrphanedToolUseTurnsInHistory` (appelé lors du chargement de session) tolère cette forme
- Vérifier le comportement de l'auto‑compaction en l'absence de texte assistant
- La PR #4176 vient de fermer un invariant tool_use↔tool_result – avant le déploiement, ajouter des tests unitaires couvrant l'alternance « tour sauté → message utilisateur suivant »
- Les APIs de style Qwen / OpenAI tolèrent ce format ; Anthropic impose une alternance stricte – si le support direct d'Anthropic est ajouté, une protection sera nécessaire (injection d'un texte assistant vide dans l'historique)
> **Point de correction unifié** : Ici et au §3.3 (interruption de résumé en cours de D3), c'est **le même invariant historique** qui est brisé. Deux options de correction (injection d'un assistant vide / accepter la tolérance de Qwen), les deux directions doivent utiliser le même choix.

#### Écosystème de signaux (Travail Phase 2)

| Outil                                | `skipLlmRound`       | `resultIsTerminal` | Remarque                                                                                  |
| ------------------------------------ | -------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `read_file`                          | utilisé avec query-only | true               | le contenu du fichier est la réponse                                                      |
| `cat` (via shell)                    | selon le scénario    | true               | identique à read_file                                                                     |
| `grep` / `glob` / `ls`               | false                | **false (par défaut)** | les résultats nécessitent souvent sélection/tri/résumé par le modèle ; la couche skill peut explicitement mettre true dans les scénarios « pure query » |
| `git status` / `git log` (via shell) | false                | true               | sortie déjà formatée                                                                      |
| Skill  outils                        | chaque skill décide  | chaque skill décide| les skills de type requête tendent vers true                                              |
| Outils MCP                           | false par défaut     | false par défaut   | opt-in explicite via allowlist                                                            |

Les outils tiers/MCP ne sont pas fiables, pas de marquage par défaut ; activation explicite via `config.toolPostExecAllowlist`.

> Le false par défaut pour `grep/glob/ls` est un choix strict : éviter que D2/D3 ne fassent une mauvaise décision dans les scénarios où le modèle doit résumer/trier.

#### Applicable et non applicable

- **Applicable** : Requêtes terminales (type read/cat/print), résultats autonomes (sortie déjà formatée par skill)
- **Non applicable** : Étapes intermédiaires de tâches multi-étapes, confirmation d'opérations d'écriture, logs complexes nécessitant interprétation

#### Risques et atténuations

| Risque                                                | Gravité | Atténuation                                                                        |
| ----------------------------------------------------- | ------- | ---------------------------------------------------------------------------------- |
| Interruption de tâche multi-étape due à un mauvais réglage de skipLlmRound | Moyen   | Sémantique batch + llmContent toujours dans l'historique, récupérable              |
| Abus d'outils tiers                                   | Moyen   | MCP désactivé par défaut, activation explicite via allowlist                        |
| Violation d'invariant historique                      | Moyen   | Ajouter tests unitaires avant déploiement ; rejeu session-load pour couverture     |
| Incohérence des attentes utilisateur (résumé attendu mais absent) | Faible  | Le paramètre `alwaysSummarize: true` peut remplacer                                |

#### Bénéfices

Économie de 3 à 4 secondes dans les scénarios de requêtes terminales (saut du dernier tour LLM).

---

### 3.2 Direction 2 : stratégie de routage vers le fast-model pour le tour de résumé

#### Positionnement

**Cette direction n'introduit pas de nouveau pipeline, mais nécessite d'étendre l'interface GeminiChat pour supporter le changement de modèle à l'exécution**.

L'infrastructure du §1.4 fournit la configuration du fast-model et le passage de bout en bout de modelOverride, mais **il n'y a pas de précédent pour exécuter fastModel + streaming sur le chat principal**, cela nécessite :

- Fonction de décision : quand passer `config.getFastModel()` comme override
- Fallback sécurisé : nouvelle interface `GeminiChat.retryStreamWithModel` (gère l'état interne du chat)
- Validation expérimentale : le basculement fast/primary sur le chat principal ne brise pas compaction / history-recording

#### Portée d'application

D2 s'applique uniquement à :

- **useGeminiStream** (chemin principal TUI) – point d'appel `sendMessageStream` L1841
- **Session ACP** (chemin d'intégration IDE) – `acp-integration/session/Session.ts:1182`, transformation synchrone Phase 3

D2 **ne s'applique pas** aux chemins suivants, pour éviter d'introduire des modes d'échec supplémentaires dans des contextes non interactifs ou isolés :

- **Runtime de sous-agent** (`agents/runtime/agent-core.ts:614`) : le sous-agent a déjà sa propre configuration de modèle
- **Tour déclenché par Cron** (`SendMessageType.Cron`, client.ts:127) : non interactif, sans urgence temps réel
- **Tour de notification** (`SendMessageType.Notification`, client.ts:129) : idem

#### Difficulté principale

Lors de l'appel à `submitQuery`, **nous ne savons pas** si le modèle, après avoir vu les résultats, va lancer un nouvel outil ou produire directement du texte. Si on utilise le fast-model alors que le modèle doit encore appeler un outil – les conséquences sont **silencieuses** : le fast-model pourrait appeler le mauvais outil ou avec de mauvais paramètres, sans signal d'erreur évident.

**Aucun champ au niveau de l'outil ne peut prédire de manière fiable** « si le prochain tour est un résumé », car cela dépend du flux de la conversation (prompt utilisateur + contexte accumulé), et non d'une propriété locale du résultat de l'outil. Exemple :

```
Utilisateur : « Lis utils.ts puis remplace tous les console.log par logger.info »
  → Outil 1: read_file → résultat autonome
  → mais le tour suivant n'est clairement pas un résumé
```

Donc D2 utilise entièrement des **heuristiques de flux de conversation** pour prédire, sans dépendre des champs de l'outil.

#### Fonction de décision : heuristique de flux + veto

```typescript
import { Kind, MUTATOR_KINDS } from '../tools/tools.js';

function selectContinuationTier(
  turn: Turn,
  userPrompt: string,
  batch: ToolCall[],
): 'fast' | 'primary' {
  // ===== 用户级别强制开关（最高优先级） =====
  const userPref = config.getSummaryTierStrategy();
  if (userPref === 'always_primary') return 'primary';
  if (userPref === 'always_fast') return 'fast'; // 仍受运行时保险约束

  // ===== 用户意图否决 =====
  // 1. user prompt 含动作动词 → 下一轮大概率还要调工具
  if (requestImpliesFurtherAction(userPrompt)) return 'primary';

  // 2. 本轮已有 mutator 工具 → 大概率有验证/读后续
  if (batch.some((c) => MUTATOR_KINDS.includes(c.tool.kind))) return 'primary';

  // 3. 本轮或历史有未解决 error → 模型需要 primary 诊断
  if (hasUnresolvedError(turn.toolResults, batch)) return 'primary';

  // ===== 输出复杂度否决 =====
  // 4. user prompt 要求深度分析（解释/对比/为什么类）
  if (needsDeepReasoning(userPrompt)) return 'primary';

  // 5. 工具调用 ≥3 个不同工具 → 跨结果叙述靠 primary
  if (needsCrossResultReasoning(turn)) return 'primary';

  // 6. 工具输出过长 → 长内容总结靠 primary
  if (estimateTotalToolOutputTokens(turn) > 4000) return 'primary';

  // ===== 模型可行性否决 =====
  // 7. fast 模型 context window 不够 → 切到 fast 会触发 compression
  //    （compression 自身要 LLM 调用，反而拖慢且增加成本）
  if (wouldTriggerCompression(turn.history, config.getFastModel()))
    return 'primary';

  // ===== 多语言兜底 =====
  if (!isPromptLanguageSupported(userPrompt)) return 'primary';

  // ===== Session 状态兜底 =====
  if (turn.justCompacted || turn.justCleared) return 'primary';

  return 'fast';
}
```

Signification des huit veto :

- **`requestImpliesFurtherAction`** : verbes d'action (`改|删|加|替换|修复|实现|新建|create|fix|change|add|remove|implement|write|update`) → tâche multi-étape
- **`MUTATOR_KINDS` déclenché** : cette étape a déjà écrit → forte probabilité d'une lecture/vérification qui suit. **Réutiliser le `MUTATOR_KINDS = [Edit, Delete, Move, Execute]` existant de `tools.ts:806`** (la propriété `kind: Kind` de chaque instance d'outil est la classification autoritaire, ne pas réinventer `isWriteTool`)
- **`hasUnresolvedError(turnResults, currentBatch)`** : deux niveaux de jugement —
  - **Toute erreur dans le lot actuel → toujours non résolue** (on ne suppose pas que les lots parallèles peuvent s'auto-corriger)
  - **L'historique dédupliqué par `(toolName, args fingerprint)`, si la dernière occurrence est encore une erreur, elle est considérée non résolue** (se baser uniquement sur toolName peut être erroné pour des paramètres différents)
  - Les shells etc. doivent remplir correctement `ToolResult.error` (dépend de la qualité des données en amont)
- **`needsDeepReasoning`** : contient des mots-clés comme « analyse / explication / pourquoi / comparaison / diagnostic »
- **`needsCrossResultReasoning`** : appels d'outils distincts ≥3 (même outil et mêmes paramètres comptent pour un)
- **Tokens de sortie > 4000** : seuil empirique, **à ajuster après mesure de la baseline du fast-model**
- **`wouldTriggerCompression`** : la fenêtre de contexte du fast-model est généralement plus petite que celle du primary, le même historique déclenchera `tryCompress` plus tôt sur fast (geminiChat.ts:1418) – la compression elle-même nécessite un appel LLM, ce qui pourrait **dégrader le temps de réponse et le coût**. Estimation : `estimateHistoryTokens(history) > fastModelContextWindow × COMPACTION_THRESHOLD` est considéré comme déclenchant
- **Langue non supportée** : seuls les mots-clés en chinois et anglais sont détectés, les autres langues (japonais, coréen, etc.) par défaut primary
- **Changement d'état de session** : première continuation après `/compact` ou `/clear` → primary pour reconstruire le modèle mental
否决方向**偏向 primary**（宁可多 2s 不要降质）。

#### 关键实现：`GeminiChat.retryStreamWithModel`

**问题**：直接 abort + 调 `client.sendMessageStream` 会破坏 chat 状态：

1. `geminiChat.ts:1428` 在 stream 启动时就 push `userContent` 到 history；重起会**再 push 一次**导致 history 出现重复 `function_response`
2. `sendPromise` 锁（`geminiChat.ts:1392, 1398`）—— abort 后需要确保 `streamDoneResolver` 被调用
3. `pendingPartialState` 等 PR #4176 引入的不变量 marker 需要正确清理
4. Telemetry span 的 model 属性需要更新

**新增接口**（`packages/core/src/core/geminiChat.ts`）：

```typescript
/**
 * Retry an in-flight or just-aborted streaming send with a different model.
 * Does NOT re-push userContent (kept from original send).
 * Resets pendingPartialState; releases stale sendPromise; re-opens span.
 */
async retryStreamWithModel(
  model: string,
  signal: AbortSignal,
): Promise<AsyncGenerator<StreamEvent>>;
```

调用契约：

- 仅在原 send 已经 abort 后调用（不并发）
- prompt_id 复用（同一用户意图）
- 历史中已经 push 的 userContent 不再 push

实现工作量约 1.5d 加单测。

#### 运行时保险

`selectContinuationTier` 返回 `'fast'` 但 stream 中出现 `ServerGeminiEventType.ToolCallRequest` 事件 → **立即 abort 当前流，调 `retryStreamWithModel(primaryModel)`**。

这覆盖"预测为 summary 实际仍需工具"的唯一静默放错场景。代价：一次 fast 调用浪费的 tokens（成本归因见 §5.3）。

#### 与 skill `modelOverride` 解耦

`useGeminiStream.modelOverrideRef`（L376, L2225）当前承载 **skill 显式选择的模型**，属"业务语义"。本方向的 fast 路由属"优化语义"，两者**必须分离**：

```typescript
// 新增独立 ref
const summaryTierRef = useRef<'fast' | 'primary' | undefined>(undefined);

// 调用点合并（不复用 modelOverrideRef）
const stream = geminiClient.sendMessageStream(
  finalQueryToSend,
  abortSignal,
  prompt_id!,
  {
    type: submitType,
    notificationDisplayText: metadata?.notificationDisplayText,
    modelOverride:
      modelOverrideRef.current ?? // skill 显式选择优先
      (summaryTierRef.current === 'fast' ? config.getFastModel() : undefined),
  },
);
```

生命周期：

| 时机                                       | `modelOverrideRef`（skill） | `summaryTierRef`（fast 路由）            |
| ------------------------------------------ | --------------------------- | ---------------------------------------- |
| 新 user turn (`!Retry && !ToolResult`)     | 清空                        | 清空                                     |
| skill 工具返回 `modelOverride` 字段        | 写入                        | 不变                                     |
| tool batch 完成 → `selectContinuationTier` | 不变                        | 写入                                     |
| Runtime fallback（看到 ToolCallRequest）   | 不变                        | 升级为 `'primary'`                       |
| Retry（用户手动 Ctrl+Y）                   | 保留                        | 升级为 `'primary'`（fast 失败不再 fast） |

skill 显式选择**永远赢**——用户的显式意图优先于优化策略。

#### Telemetry 修正

`client.ts:1303` 的 interaction span 在 turn 启动时记录 `model` 属性。fallback 触发时 model 实际变了，span 数据失真。需要：

```typescript
// fallback 触发时
span.setAttribute('llm.model.requested', fastModel);
span.setAttribute('llm.model.actual', primaryModel);
span.setAttribute('llm.fallback.reason', 'tool_call_seen');
```

并在 `addUserPromptAttributes` 中区分 `requested` / `actual` 模型，避免计费/审计混淆。

#### 用户级别强制开关

新增 setting（`packages/cli/src/config/settingsSchema.ts`）：

```typescript
summaryTierStrategy: 'auto' | 'always_primary' | 'always_fast';
// default: 'auto'
```

- `'auto'`：使用 `selectContinuationTier`（推荐）
- `'always_primary'`：完全禁用 D2 优化（生产敏感场景）
- `'always_fast'`：跳过 vetoes，**仍受运行时保险约束**（高级用户）

理由：D2 是质量换速度，部分用户/场景需要明确退出权。

#### 前置条件

- `config.getFastModel()` 已配置
- **主 chat fastModel-streaming 验证实验**（编码前 1d）：
  - mock 一个 `resultIsTerminal=true` 工具，在主 chat 反复触发 summary 轮
  - 观察 `tryCompress` 是否被错误触发（fast 模型 context window 小可能提前触发）
  - 观察 chatRecordingService 输出是否有 model mismatch
  - 观察单次 fast 调用后下一次 primary 调用是否能正常读 history
- **Fast 候选模型基线测量**（1d）：
  - 跑 100 条 summary 轮 prompt（输入含 `function_response`），测 P50/P95 端到端延迟与 time-to-first-token
  - 测 `tryCompress` 触发率 `P_compact`，验证净 RT 收益 = `(1 - P_compact) × ΔRT − P_compact × compression_RT > 0`
  - 仅当 fast P50 ≤ primary P50 × 0.5 且 P95 ≤ primary P95 × 0.6 时启用
- Fast model 与 primary model 同家族（避免 function_response 编码差异）；跨家族需 `getFastModel()` 层校验拒绝
- **`thinkingConfig` 兼容性**：
  - Fast 模型必须与 primary 在 `thinkingConfig.includeThoughts` 支持上一致；或
  - Fast 路径强制 `includeThoughts: false`（与 `sideQuery.ts:118-122` 对齐）
  - 验证：history 含 thought parts 时 fast 模型能正确处理（不报错、不把 thought 当用户输入）

#### 风险与缓解

| 风险                                                                      | 严重度 | 缓解                                                                                                                                 |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Fast 模型 tool-calling 静默放错                                           | 高     | 对话流启发式 + 运行时 ToolCallRequest abort 保险                                                                                     |
| Fast 在含 error 的输入上幻觉成"对用户可见的错误回答"                      | **高** | `hasUnresolvedError` 否决；监控用户追问率（注：`emitToolUseSummaries` 的同类风险只影响 60 token 标签，本风险影响最终回答，量级更高） |
| Fast 路径触发 `tryCompress` → 多一次 LLM 调用，**反向恶化 RT 和成本**     | **高** | `wouldTriggerCompression` 预判 gate（见决策函数 #7）；前置基线测量 P_compact 阈值                                                    |
| Compression 自身用谁的模型                                                | 中     | 触发 compression 即放弃 fast 路由（gate #7 兜底）；避免回答出问题                                                                    |
| 主 chat 切模型让 chat 内部状态/recording 异常                             | 中     | 前置验证实验覆盖；session resume 重放测试                                                                                            |
| D2 与 `emitToolUseSummaries` 同时触发 concurrent fast 调用，超 rate-limit | 中     | 二选一：D2 启用时禁用 `emitToolUseSummaries`（标题不影响功能），或共享 rate-limit token bucket                                       |
| `thinkingConfig` 在 fast / primary 间不一致导致 history 解析异常          | 中     | 同家族 + fast 路径强制 `includeThoughts: false`（见前置条件）                                                                        |
| Fallback 路径反而更贵（fast tokens 浪费 + primary 全程）                  | 中     | `fast_tokens_consumed` 决策日志监控；fallback 率 >20% 自动关 flag                                                                    |
| Telemetry span model 失真                                                 | 中     | `requested` / `actual` 拆分（见 Telemetry 修正）                                                                                     |
| 上下文格式不兼容（跨家族）                                                | 中     | `getFastModel()` 拒绝跨家族选择                                                                                                      |
| 与 skill modelOverride 语义冲突                                           | 中     | 独立 ref + skill 优先                                                                                                                |
| `/model` 运行时切换主模型后 `summaryTierRef` 决策失效                     | 低     | `/model` 命令处理时同步清空 `summaryTierRef`                                                                                         |
| fast tokens/s 反而更慢                                                    | 低     | 实测时同时测 TTFT，不只总 RT                                                                                                         |
#### Bénéfices (à mesurer)

- **RT** : économise 2-3s sur le tour de summary (ne pas inscrire dans le titre de la PR avant mesure réelle)
- **Coût** : le prix unitaire du modèle fast est généralement nettement inférieur à celui du primary ; dans les scénarios à forte utilisation de summary, le coût en tokens peut diminuer de 30-50% ; mais le gaspillage dû au chemin de fallback peut annuler une partie des gains ; il faut utiliser `fast_tokens_consumed` pour mesurer réellement le bénéfice net.

---

### 3.3 Direction 3 : Découplage de l'affichage des résultats et de l'interaction (Presentation Decoupling)

#### Problème

L'utilisateur doit attendre la fin du tour de résumé LLM pour pouvoir ressaisir après la fin de l'outil :

```
工具完成 → [渲染结果] → [submitQuery] → [等 LLM 流式回复 3-4s] → Idle → 可输入
                                         ~~~~~~~~~~~~~~~~~~~~~~~~
                                         用户已看到结果但无法操作
```

#### Conception

Ajout de l'état `StreamingState.Summarizing` :

```typescript
export enum StreamingState {
  Idle = 'idle',
  Responding = 'responding',
  WaitingForConfirmation = 'waiting_for_confirmation',
  Summarizing = 'summarizing', // 新增
}
```

#### Changements de la machine d'états

```
工具完成且结果已展示
  → 若 batch 全员 postExecution.resultIsTerminal === true:
    → 进入 Summarizing（用户可输入）
    → submitQuery 异步执行
    → LLM 总结追加到 history（或被用户新消息取消）
  → 否则:
    → 保持 Responding（用户不可输入）
```

#### Gestion des nouveaux messages utilisateur

- Lorsque l'utilisateur soumet un nouveau message alors qu'il est dans l'état `Summarizing`, on abort le résumé en cours et on traite le nouveau message.
- Le **texte partiel** du résumé déjà généré est supprimé (pas d'ajout à l'history) pour éviter qu'un demi-assistant ne pollue le contexte.
- `function_response` reste dans l'history (le modèle sait que l'outil a été exécuté).
- Les suggestions de suivi ne sont déclenchées qu'après la fin ou l'annulation de Summarizing.

#### Liste de nettoyage du texte partiel lors de l'abort

| Emplacement | Action de nettoyage |
| :- | :- |
| `pendingHistoryItemRef.current` (state React useGeminiStream) | Mettre à `null`, ne pas appeler `addItem` |
| Accumulation dans `GeminiChat.history` | Si un contenu assistant partiel a déjà été push avant l'abort, effectuer un rollback via la nouvelle interface `discardPendingAssistant()`. |
| Turn bufferisé de `ChatRecordingService` | Marquer comme cancelled, ne pas écrire dans le JSONL. |
| `dualOutput.emitText` (si activé) | Envoyer un sentinel d'abort, le sidecar le jette lui-même. |
| Tokens accumulés dans `loopDetectorRef` | Réinitialiser le compteur du tour actuel. |

Ordre d'exécution : Le signal d'abort est déclenché → les cinq nettoyages ci-dessus sont effectués → ce n'est qu'alors qu'un nouveau message utilisateur peut entrer dans `submitQuery`. Tests de concurrence : couvrir le cas où l'abort est déclenché exactement au moment où le dernier chunk est reçu.

#### Condition d'application

Tous les membres du batch ont `postExecution.resultIsTerminal === true`.

#### Invariant historique (même origine que §3.1)

Interrompre Summarizing en cours produit :

```
[user_1, function_call, function_response, user_2]
                                          ↑ 无 assistant turn
```

**Ceci est le même invariant que celui brisé par l'omission du tour LLM dans §3.1**, et doit être réparé avec la même stratégie que D1 (injecter un assistant vide / accepter la tolérance de Qwen).

- Réutiliser la couverture de test unitaire de l'invariant D1
- Le rejeu du session-load (incluant `repairOrphanedToolUseTurnsInHistory`) doit couvrir cette forme.
- Alternance Anthropic : en connexion directe, ajouter la sauvegarde en même temps que D1.

#### Risques et atténuations

| Risque | Gravité | Atténuation |
| :- | :- | :- |
| Un assistant partiel entre dans l'history lors de l'abort | **Moyen** | Supprimer explicitement le texte partiel ; ne conserver que function_response ; test unitaire couvrant la race condition. |
| Violation de l'invariant historique (pas d'assistant de suite) | **Moyen** | Problème identique à D1, correction unifiée (voir invariant historique §3.1). |
| Complexité accrue de l'état UI | Moyen | Summarizing = Idle + tâche de fond ; le chemin d'entrée réutilise Idle. |
| Le bénéfice perçu dépend du comportement utilisateur | Faible | Si l'utilisateur ne saisit rien dans les 3s, le summary est terminé → pas de bénéfice perçu ; mais **pas de régression**. |

#### Bénéfices

- **Limite théorique** : 3-4s de RT perçu (l'utilisateur saisit immédiatement après la fin de l'outil).
- **Médiane réelle** : dépend de l'intervalle de saisie de l'utilisateur — ceux qui lisent les résultats pendant 2-5s avant de saisir ne ressentiront pas de différence, mais **jamais plus lent**.

---

### 3.4 Direction 4 : Ordonnancement anticipé en flux (Stream-Ahead Scheduling)

#### Problème

`processGeminiStreamEvents` planifie les outils en lot seulement après la fin complète du stream. L'événement `ToolCallRequest` peut être yield au milieu du stream.

#### Conception

Dès la réception de l'événement `ToolCallRequest` dans le traitement du stream, démarrer immédiatement une **validation préalable** (sans exécution) :

```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);
  scheduler.prevalidate(event.value, signal);  // 新增
  break;
```

`CoreToolScheduler.prevalidate(request)` :

1. Rechercher l'enregistrement de l'outil
2. Construire l'invocation
3. Exécuter `shouldConfirmExecute` (mettre en cache le résultat)
4. Lors de `schedule()`, utiliser directement le résultat en cache

#### Contrat de pureté et Allowlist

`prevalidate` exige que `shouldConfirmExecute` soit sans effet de bord **et** que le résultat ne puisse pas être invalidé par une modification externe entre prevalidate et schedule.

**Réutiliser directement `CONCURRENCY_SAFE_KINDS` de `tools.ts:818`** :

```typescript
export const CONCURRENCY_SAFE_KINDS: ReadonlySet<Kind> = new Set([
  Kind.Read,
  Kind.Search,
  Kind.Fetch,
]);
```

C'est la classification existante du projet 'sans effets de bord + concurrente', qui correspond exactement aux besoins de prevalidate.

| Kind de l'outil | Dans l'allowlist | Raison |
| :- | :- | :- |
| `Read` (read_file, etc.) | ✅ | Lecture pure |
| `Search` (grep / glob) | ✅ | Lecture pure |
| `Fetch` (web_fetch, etc.) | ✅ | Lecture distante, pas d'effet de bord écrit |
| `Edit` | **❌** (voir TOCTOU ci-dessous) | shouldConfirmExecute est en lecture seule pure, mais le diff peut être invalide pendant l'intervalle de planification |
| `Delete` / `Move` / `Execute` | ❌ | MUTATOR_KINDS |
| `Think` | ❌ | Contient des écritures implicites (save_memory / todo_write, etc.) |
| Outils MCP | ❌ | Non fiables |
**TOCTOU : pourquoi Edit n'entre pas dans l'allowlist**

En théorie, le `shouldConfirmExecute` d'Edit est en lecture seule (lire le fichier, calculer le diff). Mais il existe une fenêtre entre la prévalidation et la planification :

```
T=0      stream reçoit Edit(file=a.ts, ...) → prévalidation
T=10ms   shouldConfirmExecute lit a.ts, met en cache diff_v0
T=300ms  stream se termine, scheduler.schedule()
T=305ms  pendant ce temps, un autre outil/IDE/processus externe modifie a.ts
T=310ms  le scheduler affiche diff_v0 à l'utilisateur
T=320ms  l'utilisateur confirme sur la base de v0
T=330ms  Edit applique les anciens paramètres au fichier v1 → contenu corrompu / échec de merge
```

C'est un TOCTOU. Direction de correction :

- **A (recommandé)** : Edit n'entre pas dans l'allowlist, la prévalidation couvre uniquement les trois catégories `CONCURRENCY_SAFE_KINDS`. Coût : le gain passe de « 50-200ms (Edit dominant) » à « 50-100ms (lecture seule) »
- **B (renforcement optionnel)** : Edit entre dans l'allowlist mais le cache est accompagné de `(mtime, size, content_hash)` ; lors de `schedule()`, on vérifie que le fichier n'a pas changé avant d'utiliser le cache, sinon on recalcule

La documentation opte provisoirement pour A.

#### Interaction avec le parallélisme existant

`coreToolScheduler.attemptExecutionOfScheduledCalls` (L2436+) utilise `partitionToolCalls` pour diviser les outils en « lot concurrent-sûr » et « lot sérialisé », le lot concurrent étant exécuté via `runConcurrently` (L2473).

La prévalidation doit s'aligner sur ce modèle de répartition :

- Le cache est indexé par `callId` (pas par `(toolName, args)`, pour éviter les conflits entre appels simultanés de même nom)
- Un appel qui échoue à la prévalidation → n'affecte pas les autres appels ; lors de la planification, cet appel reprend le chemin original `shouldConfirmExecute`
- En cas d'annulation du stream, tous les `prevalidate` en vol sont annulés en cascade via le `signal`

#### Risques

| Risque                                                           | Sévérité | Atténuation                                                                          |
| ---------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| Le diff en cache ne correspond pas au fichier réel à la confirmation (TOCTOU) | Élevée   | Solution A : Edit n'entre pas dans l'allowlist ; Solution B : cache avec vérification `(mtime, size, hash)` |
| Un échec de prévalidation perturbe la planification              | Faible   | En cas d'échec/dépassement, retombée sur le chemin `shouldConfirmExecute` original ; absence de cache ≡ non activé |
| Conflit de ressources / fd partagés entre prévalidations concurrentes | Faible   | `QWEN_CODE_MAX_TOOL_CONCURRENCY` limite déjà la concurrence (10 par défaut)          |

#### Bénéfices

50-100ms/tour (dans le périmètre `CONCURRENCY_SAFE_KINDS` seulement). Si l'on choisit la solution B incluant Edit, le gain théorique est de 100-200ms.

---

## 4. Évaluation globale et feuille de route

### 4.1 Évaluation globale

| Direction                | Gain RT                      | Complexité de mise en œuvre | Risque qualité | Dépendances                                                         | Priorité |
| ------------------------ | ---------------------------- | --------------------------- | -------------- | ------------------------------------------------------------------- | -------- |
| D1 Instructions post-outil | 3-4s/tour final               | Faible (2-3j)               | Faible         | Aucune                                                              | **P0**   |
| D2 Routage rapide du résumé | 2-3s/tour de résumé (à mesurer) | **Moyen-Élevée (9j)**       | Moyen-Élevé    | Heuristique D2 + expérience chat principal + synchronisation ACP    | **P1**   |
| D3 Découplage affichage  | 3-4s d'amélioration perçue (dépend du comportement utilisateur) | Moyen (3-5j, incluant correction d'invariants) | Moyen          | Correction invariants historiques D1                                | **P1**   |
| D4 Planification anticipée en flux | 50-200ms/tour                | Élevée (5-7j)               | Très faible    | Aucune                                                              | P2       |

#### Sous-détail D2

| Sous-tâche                                                                                                                       | Estimation |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Expérience de validation en flux du fastModel du chat principal (incluant mesure de P_compact)                                   | 1j         |
| Mesure de la baseline des modèles candidats Fast (incluant TTFT, P95, compatibilité `thinkingConfig`)                              | 1j         |
| Intégration de `selectContinuationTier` + `summaryTierRef` (useGeminiStream)                                                     | 0.5j       |
| Implémentation de l'heuristique (incluant réutilisation de `MUTATOR_KINDS` / estimation de `wouldTriggerCompression` / multilangue / mutation d'état) | 1j         |
| Implémentation de `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`                                                  | 1.5j       |
| Adaptation de la session ACP (acp-integration/session/Session.ts)                                                                | 1j         |
| Correction des spans de télémétrie (séparation `requested` / `actual`)                                                              | 0.5j       |
| Paramètre utilisateur `summaryTierStrategy` + schéma JSON + intégration `/config`                                                | 0.5j       |
| Tests unitaires (race, moment d'abandon, invariants d'historique, chemins de repli, chemin ACP)                                  | 2j         |
| **Total**                                                                                                                        | **9j**     |

> Note : l'estimation initiale de 6,5j n'incluait pas le coût du chemin ACP, du garde-fou `wouldTriggerCompression`, de la liste de nettoyage, ni de l'ingénierie du schéma de paramètres.

### 4.2 Calendrier de mise en œuvre

#### Phase 1 : D1 Instructions post-outil (1 semaine)

- Étendre `ToolResult.postExecution` (tools.ts L422) : `skipLlmRound` + `resultIsTerminal`
- `handleCompletedTools` implémente le court-circuit `skipLlmRound` (useGeminiStream.ts L2038)
- Tests unitaires couvrant les invariants d'historique
- **La phase 1 ne consomme pas `resultIsTerminal`** (réservé à la phase 3)

#### Phase 2 : Construction de l'écosystème de signaux (2 semaines, en parallèle de la phase 4)

- Marquage progressif des outils intégrés avec `skipLlmRound` / `resultIsTerminal` (voir tableau §3.1)
- Vérifier que la couverture de marquage est ≥60 % (pondérée par nombre de tours, pas par nombre d'appels)
- Collecter des données de production, calibrer les seuils des portes de refus §3.2
- En fin de phase 2, lancer l'expérience de validation du chat principal §3.2 et les mesures de base

#### Phase 3 : D2 + D3 (environ 3 semaines, incluant synchronisation ACP)

> **Correction** : la feuille de route initiale estimait 1 semaine, sans inclure l'expérience de validation du fastModel en streaming, l'implémentation de `retryStreamWithModel`, la correction unifiée des invariants, ni la synchronisation du chemin ACP.

- Avant le codage : terminer l'expérience de validation du chat principal + mesures de base (incluant compatibilité de `P_compact` avec thinkingConfig)
- Ajouter `summaryTierRef` + `selectContinuationTier` (incluant garde-fou `wouldTriggerCompression`)
- Ajouter `GeminiChat.retryStreamWithModel` + `discardPendingAssistant`
- **Adapter le chemin de session ACP** (acp-integration/session/Session.ts) pour utiliser la même fonction de décision
- Ajouter `StreamingState.Summarizing` + réutilisation du chemin d'entrée + liste de nettoyage d'abandon
- Correction unifiée des invariants d'historique (même source pour D1 et D3)
- Drapeau de fonctionnalité `experimental.summaryRoundFastModel: false`, **désactivé par défaut dans Release N**
- Paramètre utilisateur `summaryTierStrategy`
- Correction des spans de télémétrie
- Filet de sécurité à l'exécution (ToolCallRequest abort + retryStreamWithModel)

#### Phase 4 : D4 Planification anticipée en flux (peut être insérée indépendamment)

- `CoreToolScheduler.prevalidate` + allowlist
- Planification incrémentale dans `processGeminiStreamEvents`
---

## 5. Métriques, validation et limites

### 5.1 Indicateurs de performance

| Indicateur                           | Référence | Phase 1 | Phase 3                   |
| ------------------------------------ | --------- | ------- | ------------------------- |
| RT de bout en bout P50 (3 tours)     | 13,4 s    | <10 s   | <8 s (à mesurer)          |
| RT de bout en bout P95               | -         | <13 s   | <12 s (limite fallback)   |
| Temps au premier résultat perçu P50  | 13,4 s    | <10 s   | <5 s (D3 activé)          |
| Temps au premier résultat perçu P95  | -         | <13 s   | <8 s                      |
| Appels LLM (scénarios évitables)     | 3         | 2       | 2 (plus rapide)           |

> Remarque : la référence provient d’un seul échantillon ; avant le déploiement, compléter avec ≥3 scénarios.

### 5.2 Indicateurs de qualité

| Indicateur                                       | Référence | Dégradation autorisée |
| ------------------------------------------------ | --------- | --------------------- |
| Précision du tool-calling (tour fast model summary) | 100 %    | ≥98 %                 |
| Taux d’abus skipLlmRound (l’utilisateur demande plus de détails) | - | <1 %              |
| Taux de fallback_triggered du fast model          | -         | <10 % (>20 % désactive le flag) |
| Assistant demi-tour dans l’historique en état Summarizing | 0     | 0 (strict)            |

### 5.3 Indicateurs de coût

| Indicateur                                | Référence | Objectif Phase 3           |
| ----------------------------------------- | --------- | -------------------------- |
| Coût en tokens par 1000 sessions (tour summary) | 100 % | <70 %                   |
| Tokens gaspillés par fallback              | 0         | <15 % (taux fallback × fast tokens / primary tokens) |

### 5.4 Schéma du journal de décision

Chaque décision de `selectContinuationTier` et `handleCompletedTools` doit écrire un log structuré :

```
{
  turn_id, prompt_id,
  decision: 'skip' | 'fast' | 'primary',
  tier_requested: 'fast' | 'primary',          // décision (avant fallback)
  tier_actual:    'fast' | 'primary',          // exécuté (après fallback)
  signal_skipLlmRound: bool,
  signal_resultIsTerminal: bool,
  user_strategy: 'auto' | 'always_primary' | 'always_fast',
  veto_reason: 'further_action' | 'write_tool' | 'unresolved_error' |
               'deep_reasoning' | 'cross_result' | 'output_tokens' |
               'lang_unsupported' | 'compact_or_clear' | null,
  tool_count, distinct_tool_count,
  has_write_tool: bool,
  has_error: bool, has_cancel: bool,
  output_tokens_est: int,
  user_prompt_classification: 'query' | 'action' | 'analysis',
  fast_ttft_ms, primary_ttft_ms,                // double mesure en fallback
  fast_tokens_consumed: int,                    // tokens gaspillés par fallback (attribution coût)
  total_rt_ms,
  fallback_triggered: bool,
  fallback_reason: 'tool_call_seen' | 'timeout' | 'error' | null,
}
```

Indicateurs d’observation :

- Taux de déclenchement fast (attendu 30-50 %)
- Taux de fallback_triggered (attendu <10 % ; >20 % → désactiver le flag par défaut dans la prochaine release)
- Répartition des veto (détecter si trop/peu restrictif)
- fast_tokens_consumed × fallback_rate (risque de surcoût)
- Fréquence des demandes « plus de détails » (signal de régression qualité fast)

**Mesure de `fast_tokens_consumed`** :

Un stream interrompu par abort **n’aura probablement pas de `finishReason` / `usageMetadata`** — ces champs ne sont remplis qu’à la fin complète du stream. L’implémentation doit estimer :

- Prioritaire : avant l’abort, essayer `stream.return()` pour forcer le générateur à passer par le chemin finally ; peut récupérer un usage partiel
- Solution de repli : cumuler la longueur textuelle des chunks reçus × 4 pour estimer les tokens de sortie ; les tokens d’entrée sont estimés via l’historique
- Annotation : ajouter un champ `tokens_source: 'usage' | 'estimated'` dans le log, à distinguer lors de l’analyse post-mortem

### 5.5 Méthodes de validation et stratégie de publication

#### Validation

- Réutiliser le framework de chronométrage `/tmp/tool-timing.log`
- Ajouter `T_userIdle` (moment où l’utilisateur peut resaisir)
- Ajouter `T_firstToken` (moment du premier token du streaming)
- Tests A/B comparant les distributions de RT et coût avant/après chaque Phase

#### Stratégie de publication (adaptée au CLI local)

Qwen Code est un CLI local, **sans capacité de déploiement runtime** — les traditionnels « 5 % / 25 % / 100 % » ne s’appliquent pas. On utilise une **progression par releases successives** :

| Phase                  | Nœud de release       | Valeur par défaut du flag | Condition de déclenchement                                |
| ---------------------- | --------------------- | ------------------------- | --------------------------------------------------------- |
| Phase 3a : dogfood     | Release N             | `false`                   | Les utilisateurs internes activent avec `summaryTierStrategy=always_fast` |
| Phase 3b : opt-in par défaut | Release N+1 (≥2 semaines) | `false` (inchangé) | Les logs de décision du dogfood satisfont : fallback <10 %, gain net RT/coût >0 |
| Phase 3c : activé par défaut  | Release N+2 (≥4 semaines) | `true`              | Aucun rapport de régression qualité côté utilisateur Phase 3b |
| Rollback              | Release N+3 (si besoin) | `true → false`            | Fallback massif >20 % ou dégradation des métriques qualité |

**Mécanisme de rollback** :

- Pas de déploiement runtime : **rollback = nouvelle release avec flag par défaut désactivé**
- Le paramètre utilisateur `summaryTierStrategy=always_primary` offre toujours une porte de sortie immédiate, indépendamment des nouvelles releases
- Les métriques `fallback_rate` / `cost_regression` des logs de décision sont évaluées à chaque cycle de release pour décider de la suite

### 5.6 Limitations connues

1. **Données de référence limitées** : un seul échantillon ne couvre pas tous les modes de tâche ; avant déploiement, compléter les scénarios
2. **Prérequis du fast model** : pas de modèle significativement plus rapide avec un taux de tool-calling acceptable dans la même famille → D2 non activé
3. **`skipLlmRound` échange qualité contre vitesse** : sauter le LLM = renoncer à la compréhension et correction du modèle, applicable seulement aux scénarios très déterministes
4. **D2 échange qualité+coût contre vitesse** : le fast model a une qualité inférieure au primary ; le chemin fallback est plus coûteux — le gain net doit être mesuré via les logs de décision
5. **`tryCompress` peut aggraver la situation** : le fast model a un petit contexte ; la compression elle-même consomme un appel LLM — le garde-fou `wouldTriggerCompression` est indispensable
6. **Le découplage d’affichage modifie le modèle d’interaction** : les utilisateurs doivent s’adapter ; le gain perçu dépend de leur comportement
7. **Latence réseau non maîtrisable** : cette approche réduit le nombre d’appels, n’optimise pas chaque appel individuel
8. **Connexion directe Anthropic non couverte** : la tolérance d’alternance actuelle repose sur les API de style Qwen / OpenAI
9. **FastModel‑streaming sur le chat principal est une première** : aucun précédent en production, nécessite une validation indépendante
10. **CLI local sans déploiement runtime** : la stratégie de publication ne peut avancer que par releases, sans ajustement progressif rapide
11. **D2 n’agit que sur le chemin interactif** : Subagent / Cron / Notification n’en bénéficient pas, délibérément
12. **Effet à long terme de l’historique mixte inconnu** : après activation de D2, les tours dans une session basculent entre fast/primary ; la reprise de sessions longues et la cohérence contextuelle sont à observer
13. **Bénéfice réduit de D4** : après le retrait de Edit de la allowlist, la prévalidation ne couvre que les outils purement lecture (gain 50-100 ms) ; le gain de 200 ms avec Edit nécessite le mécanisme mtime/hash de la solution B
### 5.7 Emplacements clés du code

| Fichier                                                  | Symbole clé                                               | Position                 |
| -------------------------------------------------------- | --------------------------------------------------------- | ------------------------ |
| `packages/core/src/tools/tools.ts`                       | interface `ToolResult`                                    | L422                     |
| `packages/core/src/tools/tools.ts`                       | enum `Kind` + `MUTATOR_KINDS` + `CONCURRENCY_SAFE_KINDS`  | L793, L806, L818         |
| `packages/core/src/tools/tools.ts`                       | `DeclarativeTool.kind: Kind` (chaque instance de Tool en est pourvue) | L165                     |
| `packages/core/src/core/client.ts`                       | `SendMessageOptions.modelOverride`                        | L142                     |
| `packages/core/src/core/client.ts`                       | `sendMessageStream`                                       | L1216                    |
| `packages/core/src/core/client.ts`                       | `modelOverride ?? getModel()`                             | L1305, L1598             |
| `packages/core/src/core/client.ts`                       | `turn.run(model, …)`                                      | L1707                    |
| `packages/core/src/core/geminiChat.ts`                   | `sendMessageStream(model, …)`                             | L1387                    |
| `packages/core/src/core/geminiChat.ts`                   | `history.push(userContent)`                               | L1428                    |
| `packages/core/src/core/geminiChat.ts`                   | verrou `sendPromise`                                      | L1392                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `modelOverrideRef` (sélection de modèle par skill)        | L376, L2225              |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `processGeminiStreamEvents`                               | L1365                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | point d'appel `sendMessageStream`                         | L1841                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `handleCompletedTools`                                    | L2038                    |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`           | `submitQuery(ToolResult, …)`                              | L2355                    |
| `packages/core/src/services/toolUseSummary.ts`           | requête côté fast-model (précédent non‑streaming)         | L108                     |
| `packages/core/src/followup/speculation.ts`              | streaming fast-model (précédent chat forké)               | L224                     |
| `packages/core/src/config/config.ts`                     | `fastModel` + `getFastModel` + `setFastModel`             | L684, L1987, L2021       |
| `packages/core/src/core/coreToolScheduler.ts`            | `attemptExecutionOfScheduledCalls`                        | L2436                    |
| `packages/core/src/core/coreToolScheduler.ts`            | `runConcurrently` + `partitionToolCalls`                  | L2473                    |
| `packages/cli/src/acp-integration/session/Session.ts`    | point d'appel `sendMessageStream` (chemin ACP / IDE)      | L705, L965, L1182, L1423 |
| `packages/core/src/agents/runtime/agent-core.ts`         | `sendMessageStream` du Subagent (non affecté par D2)      | L614                     |

---

## 6. Enregistrement de vérification Review (2026-05-26)

### 6.1 Méthode de vérification

Conformément à plusieurs hypothèses de qualité des données préalables et estimations de bénéfices **uniquement déclarées, non quantifiées** dans le document de conception, 4 Explore subagents parallèles ont été lancés pour une enquête de code en lecture seule. Chaque subagent répond à une seule question factuelle, sans porter de jugement ni donner de suggestions d'optimisation. L'enquête est basée sur la branche `main` actuelle (HEAD: `026f2f768`).

| Question de vérification                                                               | Section associée                  |
| -------------------------------------------------------------------------------------- | --------------------------------- |
| Q3 Taux de remplissage du champ `ToolResult.error` pour tous les outils actuels        | §3.2 Dépendance préalable de `hasUnresolvedError` |
| Q4 Disponibilité réelle de `usageMetadata` après un stream abort                       | §5.4 Mesure de `fast_tokens_consumed`  |
| Q5 Existence des points de trace « relance utilisateur / clarification »               | §5.2 Signal de suivi de régression qualité du fast |
| Q6 Charge de travail IO réelle de `shouldConfirmExecute` pour les outils `CONCURRENCY_SAFE_KINDS` | §3.4 Estimation du bénéfice D4 |

### 6.2 Découverte 1 : l'heuristique `hasUnresolvedError` a une zone aveugle de 32% des outils (impact D2)

**Fait** : Sur les 22 outils disposant d'un chemin d'erreur, **15 (68%) remplissent correctement le champ `ToolResult.error`** (shell, read-file, write-file, edit, grep, glob, ls, web-fetch, mcp-tool, cron-\*, etc., tous les outils E/S principaux sont complets), **7 (32%) placent uniquement l'erreur dans la chaîne `llmContent`** : `askUserQuestion`, `monitor`, `skill`, `lsp`, `exitPlanMode`, `todoWrite`, etc.

**Il n'existe pas** de helper `createErrorResult` unifié, chaque outil implémente indépendamment la construction d'erreur.

**Impact sur la conception** :

- Si l'élément de rejet `hasUnresolvedError` du §3.2 ne vérifie que le champ `ToolResult.error`, **l'échec de ces 7 outils ne déclenchera jamais le « retour au primary »** — le tour suivant sera toujours routé vers le fast model.
- Parmi eux, **l'échec de l'outil `skill` résumé par le fast model** est un scénario à haut risque prioritaire (un grand nombre de workflows pilotés par skill dans ce dépôt seront affectés).
- La liste du §3.2 « shell, etc., doivent correctement remplir ToolResult.error (dépendance de qualité des données préalable) » est **trop étroite** ; en réalité, shell est déjà conforme, les vrais manquants sont skill / lsp / todoWrite, etc.

**Correction suggérée** : ajoutez « **Modifier les 7 outils qui ne transmettent les erreurs que via `llmContent` pour qu'ils remplissent correctement le champ `error`** » comme dépendance préalable dure de D2 (condition préalable §3.2), estimation ~2j ; n'acceptez pas le chemin sale de « recours à `llmContent.match(/^Error:/i)` » (risque élevé de faux positifs).
### 6.3 Découverte 2 : le coût d'implémentation de la métrique `fast_tokens_consumed` est sous-estimé (impact D2 / §5.3)

**Faits** :

- Dans le chemin d'abandon (`abort`) de `turn.ts` (L289-291), il y a un `return` direct, **pas de bloc `finally`, ni d'appel à `stream.return()`** – la suggestion du §5.4 disant "avant l'abandon, `stream.return()` permet au générateur de passer par le `finally`" n'existe pas dans le code actuel à cette entrée.
- La boucle `for await` de `geminiChat.ts:processStreamResponse` n'enregistre le tour que lorsqu'elle est parcourue entièrement (L1286). Une interruption par abandon signifie que le dernier chunk (contenant généralement les métadonnées complètes) **est directement ignoré**.
- **Aucun cumul de secours des tokens au niveau des chunks** n'existe dans le chemin principal de chat ; seul le niveau subagent (`agent.ts:731-744`) a un cumul, non réutilisable.
- Conclusion : lors d'un abandon, `usageMetadata` **n'est pas récupéré du tout**, on ne peut qu'estimer via `chars/4` (erreur de ±20 %).

**Impact sur la conception** :

- Dans le schéma à trois niveaux "prioritaire / secours / annotation" de la fin du §5.4, le chemin **"prioritaire" est inaccessible dans le code actuel** – il faut d'abord modifier la structure du générateur `sendMessageStream` pour y ajouter un `finally`, effort estimé à 1j, non mentionné dans le document de conception.
- Le §5.3 fixe "coût token par millier de sessions <70%" comme objectif de la Phase 3, mais si la métrique elle-même a une erreur de ±20 %, alors **"70 %" et "82 %" se situent dans le bruit de mesure**.

**Corrections suggérées** :

- Réécrire le §5.3 comme **indicateur de tendance**, ne servant pas de critère de release ; utiliser plutôt le taux de `fallback_triggered` dans les logs de décision combiné à la tendance de `fast_tokens_consumed` comme double indicateur conjoint.
- Ajouter au §5.4 : l'implémentation de `fast_tokens_consumed` nécessite d'abord de modifier le chemin d'abandon de `turn.ts` en ajoutant un `finally` + `stream.return()`, à mentionner comme complément d'effort au §3.2 (+1j).

### 6.4 Découverte 3 : `user_prompt_classification` et le "suivi des questions utilisateur" doivent être créés (impact D2 / §5.2)

**Faits** :

- Dans `packages/core/src/followup/`, il existe déjà `speculation.ts` / `suggestionGenerator.ts` / `followupState.ts`, mais leur télémétrie (`PromptSuggestionEvent`) enregistre **"suggestion système acceptée/ignorée"**, et non "question active de l'utilisateur".
- `ChatRecordingService` stocke les messages utilisateur mais **ne leur attribue pas de catégorie**.
- Une recherche dans tout le dépôt ne trouve ni `user_prompt_classification`, ni de correspondance de modèles de questions en chinois/anglais, ni de mécanisme de type `clarif*` / `intentDetect`.

**Impact sur la conception** :

- Le champ `user_prompt_classification: 'query' | 'action' | 'analysis'` dans le schéma des logs de décision du §5.4 **n'a pas de source de données** – il ne peut être déduit ni des `PromptSuggestionEvent` existants, ni lu à partir de `ChatRecord`.
- Le signal de surveillance du §5.2 "fréquence des questions utilisateur du type 'plus de détails'" souffre du même problème, **le point d'ancrage existant le plus proche `followupState.onOutcome` n'est pas réutilisable**.

**Corrections suggérées** :

- Ajouter aux prérequis du §3.2 "implémentation minimale d'un classifieur d'entrée utilisateur" (correspondance de modèles en chinois/anglais, ~3j), sinon les champs `user_prompt_classification` et `requestImpliesFurtherAction` des logs de décision du §5.4 manqueront de données.
- Ou **accepter** de ne pas disposer de ces deux signaux pendant la phase de dogfood Phase 3a, en ne surveillant la régression de qualité que via le taux de `fallback_triggered` – coût faible mais risque élevé.

### 6.5 Découverte 4 : contradiction interne de la conception D4 – l'allowlist et l'attribution des gains ne sont pas alignés (impact D4 / §3.4)

**Faits** :

- Pour les trois catégories d'outils `Kind.Read` (read_file), `Kind.Search` (glob / grep), `Kind.Fetch` (web_fetch), les méthodes `shouldConfirmExecute` / `getConfirmationDetails` **héritent pour la plupart de l'implémentation par défaut de `BaseToolInvocation`, sans aucune opération d'E/S** (read_file / glob / grep n'ont pas de surcharge, web_fetch ne fait qu'analyser l'hôte de l'URL avec 5-10 lignes de chaîne).
- Les véritables opérations d'E/S se trouvent dans `Edit` / `WriteFile` (`calculateEdit` + `readTextFile` + `Diff.createPatch`, typiquement ~20ms), mais le §3.4 les exclut de l'allowlist pour éviter le problème TOCTOU.
- **Résultat** : pour les trois outils restant dans l'allowlist, le travail de pré-validation est quasiment le même que sans pré-validation – l'allowlist ne bloque en réalité que "les seules E/S économisables sur Edit", laissant "les outils dont le coût est déjà nul".

**Impact sur la conception** :

- Le récit "validation IO préalable" du §3.4 **n'est pas valide** : le gain réel de 50-100ms provient de **"la fin complète du flux → l'attente de planification en lot est supprimée"**, presque indépendamment des IO des outils.
- Une attribution erronée des gains entraîne deux problèmes :
  1. **L'allowlist pourrait être plus large** – tous les outils dont la pré-validation est idempotente peuvent y figurer, sans être liés à `CONCURRENCY_SAFE_KINDS`.
  2. **L'investissement de 5-7j est difficilement justifiable** – si le gain réel n'est que d'environ 50ms dû au changement du modèle d'ordonnancement, et qu'Edit n'est pas dans l'allowlist, le ROI de cet investissement est inférieur à ce que suggère le document de conception.

**Corrections suggérées** : Réécrire l'attribution des gains dans §3.4 :

- La décomposer en deux parties : (a) l'économie de l'attente du flux grâce au changement de modèle d'ordonnancement ~50ms, (b) l'économie possible des IO côté outil ~0ms (dans l'allowlist) / ~20ms (si Edit est inclus).
- Dans le tableau d'évaluation globale §4.1, modifier le gain RT de D4 de "50-200ms" à "30-80ms (solution A, principalement due au changement de modèle d'ordonnancement) / 100-200ms (solution B, incluant Edit)".
- Dans la feuille de route §4.2, rétrograder davantage D4 – la simple modification du modèle d'ordonnancement peut être faite indépendamment, sans être forcée de lier le concept de pré-validation.

### 6.6 Impact combiné sur la feuille de route

| Section                 | Estimation initiale | Estimation après vérification | Source de l'augmentation                                                                                          |
| ----------------------- | ------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| D2 §3.2 effort (tableau détaillé §4.1) | 9j                  | **14-16j**                    | +2j (découverte 1 transformation préalable des outils) +1j (découverte 2 modification finally de turn.ts) +3j (découverte 3 classifieur d'entrée, si voie dure) |
| D4 §3.4 évaluation globale            | 5-7j                | 5-7j (inchangé)               | Effort inchangé, mais **l'attribution des gains RT passe de "IO côté outil" à "modèle d'ordonnancement"**, baisse du ROI de l'investissement |
| Durée totale Phase 3 (§4.2)           | ~3 semaines         | **~4-5 semaines**             | Augmentation de l'effort D2 + PR de transformation préalable des outils passant par un cycle de review séparé    |

**Suggestions de correction pour la feuille de route originale** :

1. **Garder D1 (P0) et D3 juste après** – La vérification n'a pas touché à leurs hypothèses centrales, le jugement ROI reste inchangé.
2. **Durcir les conditions de démarrage de D2** – Faire des travaux préalables des découvertes 1/2/3 (total ~6j) une "porte de démarrage D2" ; ne pas entrer dans l'expérience préalable du §3.2 tant qu'elle n'est pas franchie.
3. **Réévaluer la priorité de D4** – Puisque le vrai gain vient du changement du modèle d'ordonnancement et non des IO côté outil, soit (a) accepter 30-80ms et rétrograder D4 en post-P3, soit (b) envisager la solution B (Edit + mtime/hash) pour récupérer 100-200ms mais avec 5-7j supplémentaires.
4. **Ne pas modifier la ligne de base d'échantillonnage unique du §1.2** – Mais dans le §5.1, la colonne P95 ne devrait pas spécifier de chiffres avant la mise en œuvre de D1 et la complétion d'au moins 3 catégories de scénarios de base.

### 6.7 Points non couverts par la vérification

Les points suivants relèvent de jugements subjectifs ou de questions d'intention de l'auteur, n'ont pas été traités par le subagent lors de cette vérification, et sont réservés pour une discussion lors de la revue de conception ultérieure :

- L'ordre de mise en œuvre de D2 devrait-il être après D3 ? (question d'ordre subjectif)
- D1/D3 devraient-ils être fusionnés dans la Phase 1 ? (stratégie de mise en œuvre)
- Le seuil ≥3 de `needsCrossResultReasoning` au §3.2 est-il un ajustement inverse aux scénarios de base du §1.2 ? (intention de l'auteur)
- Les ancres de lignes dans le tableau des emplacements de code clés au §5.7 devraient-elles être remplacées par des ancres symboliques ? (stabilité de la documentation)

---

## 7. Évaluation des "floating oils" et prochaines étapes (deuxième revue 2026-05-26)

### 7.1 Faits à l'origine de ce réordonnancement

Après la vérification du §6, deux **faits modifiant le jugement de ROI** ont été découverts :

1. **`cache_control` de DashScope est déjà implémenté** (`packages/core/src/core/openaiContentGenerator/provider/dashscope.ts:172-181`)
   - Les requêtes en streaming marquent `system + dernier message + dernière définition d'outil`
   - Les données de `cached_tokens` sont déjà collectées dans `usageMetadata.cachedContentTokenCount` (`converter.ts:1124-1149`)
   - Il s'agit d'un mécanisme de préfixe de cache : le tour N+1 atteint automatiquement le préfixe écrit par le tour N
   - **Le tour de résumé est justement celui où le préfixe est le plus long**

2. **Le prompt système est déjà stable** (audit de `prompts.ts`)
   - Il n'y a pas de problèmes graves comme cwd / timestamp / git status / liste de fichiers / état LSP qui changent à chaque tour
   - `process.cwd()` n'est utilisé que comme interrupteur pour `isGitRepository()`, et n'est pas écrit dans le contenu du prompt
   - Les seuls points dynamiques : déclenchement de l'outil `save_memory` / changement de `/model` / chargement dynamique MCP (tous événementiels, basse fréquence)

### 7.2 Ces deux faits changent le jugement de ROI de D2

Le document §3.2 suppose que "le modèle rapide est environ 2s plus rapide que le modèle principal", avec une ligne de base **principal non mis en cache vs rapide non mis en cache**.

Mais dans la réalité, le modèle principal est **mis en cache** (le tour de résumé atteint justement le cache le plus fort), donc la comparaison correcte est :
> cache primaire vs rapide non-caché

| Route                         | Latence estimée | Remarques                                     |
| ----------------------------- | --------------- | --------------------------------------------- |
| cache primaire hit 80% préfixe | ~1.8-2.2s      | Performance actuelle du tour de résumé         |
| rapide sans cache (non partagé entre modèles) | ~1.5-2s | Performance réelle après le basculement D2 |

**Écart net : quelques centaines de millisecondes, voire le rapide peut être plus lent**. Avec un coût d'ingénierie de 14-16j + risque qualité + gaspillage de fallback, **le bénéfice net de D2 est proche de 0 ou négatif**.

§3.2 Nouvelle condition préalable **obligatoire** : les mesures de base doivent comparer le primaire **caché** vs le rapide **non-caché**, et `T_primary_cached < T_fast_uncached × 1.5` doit être vrai pour que D2 soit activé.

### 7.3 Liste des candidats (réorganisée par facilité)

**Vrai facile (à faire immédiatement, < 1j d'effort, risque très faible, bénéfice certain)** :

| Élément                     | Effort | Bénéfice                              | Emplacement                                                                  |
| --------------------------- | ------ | ------------------------------------- | ---------------------------------------------------------------------------- |
| Instruction de réponse concise | 30min | ~2s/tour de résumé (réduction de moitié des tokens de sortie) | Ajouter une ligne dans la section Final Reminder de `prompts.ts`             |
| Exposer la télémétrie du taux de hit cache | 0.5j   | 0s directement, mais **enableur** pour les décisions futures | `cachedContentTokenCount` déjà collecté, manque d'exposition ; doit aussi identifier `save_memory` pour marquage séparé |

**Presque facile (attendre les données, 0.5-1j d'effort)** :

| Élément                            | Effort                | Bénéfice                          | Prérequis de décision                                              |
| ---------------------------------- | --------------------- | --------------------------------- | ------------------------------------------------------------------ |
| `tool_choice='none'` au tour de résumé | 0.5-1j                | 0.3-1s (sampling saute les tokens tool_call) | Logique de détection "c'est un tour de résumé" nécessaire, risque faible d'erreur |
| Désactiver la réflexion au tour de résumé | 1j                    | 0.5-2s                            | Significatif seulement pour les modèles avec réflexion activée (qwen3.5-plus, glm-4.7, kimi-k2.5, etc.) |
| Traitement par lots des chunks au niveau UI | 0.5j recherche + 0.5j implémentation | À valider                        | Hypothèse : le coût cumulé du rendu des tokens de `useGeminiStream` pour les longs résumés est non négligeable |

**À étudier (peut-être gros poisson)** :

| Élément                               | Effort de recherche   | Bénéfice potentiel  | Inconnue clé                                                                                |
| ------------------------------------- | --------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| ~~Support de DashScope `scope: 'global'`~~ | ~~0.5j doc + 0.5j A/B~~ | ~~Hit inter-session~~ | **Déjà étudié, conclusion (c) non faisable** (voir §7.4 découverte B résultats). Cette ligne est conservée comme trace de décision, ne pas relancer l'étude |

**Modifications moyennes (pas faciles, évaluation séparée)** :

| Élément                              | Effort  | Risque | Bénéfice        |
| ------------------------------------ | ------- | ------ | --------------- |
| D1 `skipLlmRound` (scénario requête finale) | 2-3j    | Moyen  | 3-4s/tour final |
| Découpage des résultats d'outils au tour de résumé (sous-ensemble D5) | 2j      | Moyen  | 1-2s            |
| État D3 `Summarizing`                | 3-5j    | Moyen  | Amélioration perçue 3s |
| Régime du prompt système             | 2-3j avec A/B test | Moyen  | 0.5-1s          |

**Directions abandonnées (ne plus faire)** :

| Élément                                     | Raison d'abandon                                                       |
| ------------------------------------------- | ---------------------------------------------------------------------- |
| Routage D2 vers modèle rapide               | Annulé par le cache DashScope, bénéfice net proche de 0 ou négatif     |
| D4 prévalidation                            | Attribution de bénéfice erronée (réellement seulement ~50ms du modèle de planification), 5-7j d'effort pas rentables |
| Stabilisation du prompt système             | Déjà stable, rien à faire                                              |
| Terminaison anticipée du flux (abort précoce des formules de fin) | Risque élevé de mauvaise interprétation, l'utilisateur perçoit la réponse coupée |

### 7.4 Trois nouvelles découvertes à développer

#### Découverte A : Mécanisme réel de `tool_choice='none'`

Dans l'API OpenAI / DashScope, `tool_choice='none'` n'est pas seulement "interdire l'outil" — la phase de sampling du modèle saute complètement l'allocation de probabilité du token spécial `<tool_call>`, le décodeur suit directement le chemin de génération en langage naturel. Le bénéfice ne vient pas d'"économiser quelques tentatives", mais du sampling lui-même plus rapide.

#### Découverte B : `scope: 'global'` déjà un précédent Anthropic dans le dépôt

`packages/core/src/core/anthropicContentGenerator/converter.test.ts:85, 1543` contient déjà `cache_control: { type: 'ephemeral', scope: 'global' }`. Mais `provider/dashscope.ts:288` marque cache_control **sans passer scope** :

```typescript
cache_control: { type: 'ephemeral' },   // pas de scope
```

Si le serveur DashScope reconnaît `scope: 'global'` :

- system + tools passent en cache global (TTL bien supérieur aux 5min d'ephemeral)
- **Hit inter-session**, latence de démarrage réduite
- Ce seul bénéfice pourrait dépasser toutes les hypothèses de bénéfice du D2 original

##### Résultats de l'étude (26 mai 2026, conclusion : (c) non faisable, fermer cette piste)

En consultant la documentation officielle d'Alibaba Cloud Bailian `help.aliyun.com/zh/model-studio/context-cache`, voici la liste des faits :

| Question                   | Conclusion                                                                                                                                                                                           | Preuve                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Support du champ `scope`   | **Non supporté**. Seul `type: 'ephemeral'` est reconnu, tout `scope`/`persistent`/`global` est silencieusement ignoré                                                                                 | Texte officiel : "Seul le réglage de `type` à `ephemeral` est supporté" |
| TTL réel d'ephemeral       | **Fenêtre glissante de 5 minutes** (réinitialisée après un hit)                                                                                                                                     | Documentation Bailian clairement indiquée            |
| Mécanisme long TTL / global | **Aucun mécanisme d'API cloud public**. Pas de valeur `persistent` pour type, pas d'API de préchargement indépendante, pas de `prompt_cache_key` ; le seul produit "persistant global" est le cache de contexte global PAI (auto-déploiement + vLLM + Lingjun + Redis partagé), sans lien avec l'API DashScope | Docs PAI                                           |
| Partage inter-session      | Même compte + même modèle + contenu correspondant → déjà un hit (c'est ce que fait déjà `ephemeral`) ; jamais partagé entre comptes différents                                                         | Documentation Bailian                               |
| Tarification               | Cache write 125 %, cache read explicite 10 %, **cache read implicite 20 %** (obtient aussi une remise implicite de 20 % sans marquage `cache_control`)                                               | Documentation tarif Bailian                         |
| Prompt minimal cachable    | **1024 tokens**                                                                                                                                                                                    | Documentation Bailian                               |
| Support modèle (cache explicite) | qwen3.7-max / qwen3.6-plus / qwen3.5-plus / qwen3-coder-plus / qwen3-vl-plus / deepseek-v3.2 / kimi-k2.5 / glm-5.1 sont tous listés explicitement. **qwen3.6-plus et qwen3.7-max bénéficient aussi de la remise de 90 % pour cache explicite** | Liste des modèles Bailian (revérifié le 26 mai 2026) |
**Quelques implications supplémentaires des sous-découvertes** :

1. **Fenêtre glissante TTL** est une bonne nouvelle pour la boucle d'agent – les intervalles d'appels consécutifs dans la boucle sont généralement < 30 s, **le cache reste toujours frais, il n'expire pas après 5 min**
2. **Remise de 20% du cache implicite** est un bonus gratuit – même sans spécifier `cache_control`, il s'applique ; mais un contrôle fin nécessite un cache explicite
3. ~~`qwen3.6-plus` n'est pas dans la liste explicite~~ — **Correction (2026-05-26)** : après vérification, qwen3.6-plus **est bien dans la liste du cache explicite**, bénéficiant de 90% de réduction. Le rapport précédent contenait une erreur, déjà corrigée dans le premier tableau de cette section
4. **La pratique actuelle de `dashscope.ts:288` est déjà la limite des capacités de l'API DashScope Cloud Public** – il n'y a plus de marge d'optimisation

**Confirmation supplémentaire pour la décision D2 en §7.2** :

La fenêtre glissante TTL implique que dans la boucle d'agent, le tour de résumé **a presque 100% de chance de toucher le cache** du primaire (les tours précédents viennent de l'atteindre, dans les 5 min). Passer au modèle rapide D2 non seulement brise la chaîne d'écritures de cache cumulées, **mais fait aussi régresser le tour de résumé de 'presque 100% de hit' à 'complètement miss'** – le jugement de gain net est encore plus clairement négatif que l'hypothèse initiale de §7.2.

#### Découverte C : La couche de rendu UI est un angle mort négligé

La baseline §1.2 évaluait la "surcharge du framework" à 0,3 s (3%), mais c'était une estimation grossière. Ink 7 + React 19.2 déclenche setState → re-render pour chaque chunk. Un long résumé cumulé peut atteindre 200-500 ms. Il faut examiner comment `useGeminiStream` traite le flux de tokens, s'il y a `requestAnimationFrame` / `useDeferredValue` pour fusionner les chunks.

### 7.5 Checkpoint en attente de données – Quelle décision réexaminer lorsque les données arrivent

Cette section est le **point d'entrée actif de ce document** : dès que des mesures arrivent, consultez le tableau ci-dessous pour décider quelle décision reconsidérer.

#### Checkpoint 1 : Après obtention des données de taux de hit du cache

**Condition de déclenchement** : La télémétrie du taux de hit du cache est exposée depuis ≥3 jours dans la flaque de surface, les journaux de décision contiennent la distribution `cached_tokens` / `prompt_tokens`.

**Données à examiner** :

- Distribution P50, P90 du taux de hit global (cached / prompt)
- Par tour : taux de hit respectifs pour Round 1 / Round 2 / Round 3 (résumé)
- Taux de hit du tour suivant après déclenchement de `save_memory` (devrait être proche de 0)
- Taux de hit du tour suivant après changement de `/model` (devrait être proche de 0)

**Chemin de décision** :

| Taux de hit global | Signification | Action |
|-------------------|---------------|--------|
| > 70% | L'état actuel est déjà proche de la limite théorique | Faire seulement #1 instructions concises + enquête sur la découverte B ; le reste au besoin |
| 40-70% | Il reste de la marge mais la source est inconnue | Analyser les taux de hit par tour, identifier où se produisent les miss |
| < 40% | Un point dynamique casse le cache | Réauditer la fréquence de déclenchement du system prompt / userMemory ; `save_memory` pourrait être plus fréquent que prévu |

#### Checkpoint 2 : Résultat de l'enquête sur la documentation DashScope `scope: 'global'` ✅ Terminé (2026-05-26)

**Résultat** : **Totalement non reconnu**. Voir le paragraphe "Résultat de l'enquête" de la découverte B en §7.4.

**Action déjà exécutée** : Accepter l'état actuel, ignorer ce point. `dashscope.ts:288` garde le marquage `ephemeral` existant, aucune modification nécessaire.

**Ne pas relancer cette enquête** – sauf annonce officielle de DashScope d'un nouveau mécanisme de persistance.

#### Checkpoint 3 : Résultat de l'enquête sur la couche de rendu UI

**Condition de déclenchement** : Enquête sur la découverte C terminée (examen du traitement du flux de tokens de `useGeminiStream` + mesures réelles avec Ink/React DevTools).

**Chemin de décision** :

| Résultat | Action |
|----------|--------|
| Cumul du rendu du long résumé stream > 200 ms | Passer au batching (`useDeferredValue` ou throttling personnalisé) |
| Coût de rendu < 100 ms | Clore cette piste |

#### Checkpoint 4 : Deuxième mesure de baseline après avoir terminé la "vraie flaque de surface"

**Condition de déclenchement** : #1 instructions concises + décisions des Checkpoints 1/2/3 terminées depuis ≥1 semaine.

**Données à examiner** :

- Comparaison du temps de réponse P50 de bout en bout avec la baseline d'un seul échantillon de §1.2 (13,4 s)
- P50 / P95 du tour de résumé seul
- Taux de relance des utilisateurs (si la flaque A a également inclus la classification des entrées utilisateur)

**Chemin de décision** :

| Économie cumulée | Action |
|------------------|--------|
| > 4 s (atteindre 9,6 s de P50 bout en bout) | Évaluer D1 `skipLlmRound` (économise encore 3-4 s par tour final) |
| 2-4 s | Accepter l'état actuel, évaluer si l'amélioration perceptive D3 vaut la peine |
| < 2 s | Remettre en question : la flaque de surface a-t-elle été surestimée, ou y a-t-il un goulot d'étranglement non identifié (RTT réseau, latence du fournisseur) |

### 7.6 Jugement final des différentes directions de §3

Basé sur la validation §6 + réorganisation du ROI de cette section :

| Direction | Priorité initiale §3 | Jugement de cette section | Raison |
|-----------|----------------------|---------------------------|--------|
| D1 Instructions post-outil | P0 | **P0 conservé**, mais attendre que la flaque de surface soit terminée pour réévaluer | Le ROI est toujours bon, mais ce n'est plus "à faire immédiatement" – d'abord récupérer les flaques moins coûteuses |
| D2 Routage rapide du résumé | P1 | **Remettre à plus tard / Won't Fix** | Contrebalancé par le cache DashScope, investissement de 14-16 j pour un rendement quasi nul |
| D3 Découplage d'affichage | P1 | **Conservé comme optionnel**, voir les données du Checkpoint 4 | L'amélioration perceptive est certaine, mais le temps de réponse absolu ne change pas, dépend du comportement utilisateur |
| D4 Ordonnancement anticipé en streaming | P2 | **Remettre à plus tard** | Le bénéfice est mal attribué, en réalité ~50 ms ne vaut pas 5-7 j |

### 7.7 Ordre d'exécution recommandé

**Jour 1** (réalisable par une seule personne en un jour) :

- ✅ Ajouter une instruction de réponse concise dans `prompts.ts` (30 min)
- ✅ Exposer `cachedContentTokenCount` dans la télémétrie + marquer les changements `save_memory` / `/model` (0,5 j)
- ✅ Lancer l'enquête sur la découverte B : requête documentaire DashScope `scope: 'global'` + vérification de l'utilisation existante d'Anthropic (0,5 j)

**Jour 2-3** :

- Recueillir les premiers lots de données de taux de hit du cache
- Lancer l'enquête sur la découverte C : chemin de rendu React de `useGeminiStream`
- Selon le résultat du Checkpoint 2, décider s'il faut faire la modification `scope: 'global'`

**Fin de la semaine 1** :

- Décision sur les données du Checkpoint 1 (voir la distribution)
- Décider s'il faut faire `tool_choice='none'` / désactiver le thinking (selon les données de taux de hit)

**Semaine 2-3** :

- Deuxième mesure de baseline du Checkpoint 4
- Décider s'il faut lancer D1 (le plus gros élément non-flaque, 3-4 s par tour final)

**À ne jamais faire** : D2 / D4 / stabilisation du system prompt.

### 7.8 Audit du contenu dynamique dans `prompts.ts` (2026-05-27)

§7.1 concluait "le system prompt est stable" avec un grep rapide seulement. Cette section est un audit systématique de `packages/core/src/core/prompts.ts` (1169 lignes), dressant une liste comme base pour l'analyse future du taux de hit du cache et les décisions sur les flaques de surface.

**Méthode d'audit** : Énumérer toutes les expressions d'interpolation `${...}`, les IIFE, les appels `process.*` / `new Date` / `Date.now` / `Math.random` / `fs.*`, et pour chacun, déterminer s'il change ou non au sein d'une même session.

#### Absence totale (problèmes souvent suspectés)

| Candidat | Réalité dans le code |
|----------|----------------------|
| `Date.now()` / `new Date()` | **Zéro occurrence** dans tout le fichier (aucune correspondance avec `rg`) |
| `Math.random()` | **Zéro occurrence** |
| Valeur de `process.cwd()` écrite dans le prompt | Seulement L366 : `if (isGitRepository(process.cwd())) { ... }`, la valeur **n'est pas écrite dans la chaîne**, sert uniquement de commutateur |
| Appels de sous-processus git status / git branch | **Zéro occurrence**, la partie git est un texte d'instruction statique |
| Injection de la liste de fichiers courants / structure du projet | **Zéro occurrence** |
| État LSP / nombre d'erreurs | **Zéro occurrence** |
| Historique des entrées utilisateur | **Zéro occurrence** (l'historique passe par messages, pas dans system) |
#### Une fois au démarrage, inchangé durant la session

| Emplacement | Contenu                                                                                             | Quand peut-il changer          |
| ----------- | --------------------------------------------------------------------------------------------------- | ------------------------------ |
| L190        | `process.env['QWEN_SYSTEM_MD']` détermine la source de basePrompt (par défaut vs system.md utilisateur) | Invariable pendant le processus |
| L342-343    | `process.env['SANDBOX']` détermine la version de la section sandbox (Seatbelt / Sandbox / Outside) | Invariable pendant le processus |
| L366        | `isGitRepository(process.cwd())` détermine si la section git est insérée                           | cwd généralement constant dans la session |
| L871        | `process.env['QWEN_CODE_TOOL_CALL_STYLE']` détermine le style d'appel d'outil (qwen-coder / qwen-vl / general) | Invariable pendant le processus |

#### Déclenchement par événement (faible fréquence)

| Paramètre                                        | Condition de déclenchement                                | Estimation de fréquence |
| ------------------------------------------------ | --------------------------------------------------------- | ----------------------- |
| `userMemory` (1er paramètre de `getCoreSystemPrompt`) | Outil `save_memory` / `/memory refresh` / chargement d'extension | 0-3 fois/session        |
| Nom du modèle (affecte le choix de `getToolCallExamples`) | Changement via `/model`                                   | Rare                    |
| `appendInstruction`                              | Option de configuration, quasi invariant dans la session  | Presque jamais          |
| `deferredTools` (`buildDeferredToolsSection`)    | Chargement dynamique des outils MCP                       | Principalement au démarrage de la session |

#### Un petit piège discret

L207-209 : si la variable d'environnement `QWEN_SYSTEM_MD` est définie, **à chaque** appel de `getCoreSystemPrompt`, `fs.readFileSync(systemMdPath)` est exécuté :

```typescript
const basePrompt = systemMdEnabled
  ? fs.readFileSync(systemMdPath, 'utf8')
  : `...`;
```

- Fichier inchangé → contenu stable → hit cache non affecté
- Mais chaque appel LLM entraîne une E/S synchrone (par défaut `.qwen/system.md`, plus lent sur un montage réseau)
- N'affecte pas la conclusion de cette section sur le « cache‑friendliness », simplement une petite limitation de performance connue

#### Conclusions en cascade

1. **Le system prompt produit un résultat byte‑for‑byte identique à chaque fois dans une session stable** → la clé de cache éphémère DashScope (basée sur le hachage du contenu) reste constante → **le taux de hit cache de la section system est pratiquement de 100 %**
2. Le seul événement qui brise le cache est `save_memory` — fonctionnalité centrale, on ne peut pas la sacrifier pour le cache
3. **Analyse de coût de l’option n°1 (instruction de réponse concise)** : en ajoutant l’instruction au segment Final Reminder (L389-390) → le contenu du system prompt change une fois → **première requête cache miss (coût de préchauffage unique), toutes les requêtes suivantes continuent de hit**
4. **Le jugement « stabiliser le system prompt » (mentionné au §7) est désormais officiellement obsolète et soutenu par des preuves** — non seulement ce n’est pas nécessaire, mais même « en théorie cela réduirait encore le taux de cache miss » est faux, car il est déjà ≈ 0
5. Ce rapport d’audit peut servir de référence de base pour les discussions futures, évitant des `grep` répétés ; si `prompts.ts` subit des modifications importantes, cette section devra être mise à jour en conséquence
