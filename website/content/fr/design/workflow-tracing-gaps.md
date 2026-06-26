# Analyse de granularité insuffisante des Spans au niveau du Workflow (P1)

> Basé sur la révision du 2026-05-13 de qwen-code origin/main

## État actuel

qwen-code dispose d'une infrastructure de tracing :

| Composant      | Emplacement                                       | Description                                                                   |
| -------------- | ------------------------------------------------- | ----------------------------------------------------------------------------- |
| Définition des types de Span | `packages/core/src/telemetry/session-tracing.ts` | `interaction`, `llm_request`, `tool`, `tool.execution`                        |
| Outil Tracer   | `packages/core/src/telemetry/tracer.ts`          | session root context, `withSpan`, `startSpanWithContext`                      |
| Point d'entrée des interactions | `packages/core/src/core/client.ts`               | Les interactions de haut niveau démarrent explicitement un span `interaction` |
| Gestion du cycle de vie | —                                                | AsyncLocalStorage + WeakRef + nettoyage TTL                                  |

Actuellement, deux types de spans génériques sont principalement intégrés de manière stable dans le runtime :

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Conclusion : nous sommes entrés dans la phase « backbone de tracing présent », mais les limites des phases du workflow agent ne sont pas encore complètement encodées dans l'arbre de trace.**

### Comparaison : types de spans déjà implémentés par claude-code

Référence : `claude-code/src/utils/telemetry/sessionTracing.ts` (ligne 49) :

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Éléments manquants

| Span / mécanisme manquant                       | Impact                                                |
| ----------------------------------------------- | ----------------------------------------------------- |
| Span `permission_wait` / `blocked_on_user`      | Impossible de distinguer le temps d'attente d'approbation vs le temps d'exécution de l'outil |
| Span `hook`                                     | Le temps du hook est intégré dans le span de l'outil, rendant les limites floues |
| Span racine `subagent`                          | Les appels llm/tool internes au subagent ne forment pas de sous-arbre de trace |
| Câblage réel de `tool.execution`                | Le helper est défini mais le chemin principal ne l'appelle pas |
| Câblage parent-enfant stable                    | Les spans sont souvent des frères sous la racine de la session plutôt qu'un arbre hiérarchique |

## Analyse détaillée

### 1. L'attente d'approbation de l'utilisateur n'est pas dans la trace

Lorsqu'un appel d'outil attend l'approbation, le chemin de transition d'état est `awaiting_approval` → `scheduled` → exécution.

- « Attente de confirmation utilisateur » n'est qu'une transition d'état, pas un nœud de trace
- La durée d'attente d'approbation n'est pas visible dans la trace
- Si un outil est lent, il est impossible de savoir s'il « bloque en attendant l'utilisateur » ou si « l'outil lui-même est lent à exécuter »

### 2. Les hooks ont des enregistrements d'événements mais pas de spans indépendants

Après l'exécution d'un hook Pre/Post, un `HookCallEvent` est produit, passant par `logHookCall()`, mais aucun span OTel indépendant n'est créé.

- Un hook lent se manifeste par un span d'outil externe plus lent
- Un échec de hook se manifeste par un « échec de l'outil »
- La trace ne peut pas répondre à « le temps a-t-il été passé dans le hook ou dans tool.execution »

### 3. Subagent est log/metric et non une sous-arborescence de trace

Lors du démarrage/achèvement d'un subagent, un `SubagentExecutionEvent` est enregistré et passe dans les logs/metrics, mais il ne forme pas de sous-arbre de span explicite.

- On peut compter « quel subagent a été exécuté »
- On ne peut pas suivre dans la trace « quels appels llm/tool ce subagent a déclenchés »
- La chaîne causale est floue dans les scénarios de subagents concurrents

### 4. Le helper tool.execution est défini mais non connecté au chemin principal

`startToolExecutionSpan()` / `endToolExecutionSpan()` existent déjà dans `session-tracing.ts`, mais aucun appel n'est visible dans le code non-test.

Arbre de trace actuel :

```
session-root
  interaction
    api.generateContent
    tool.Bash
  subagent_execution        (log/metric)
  hook_call                 (event/QwenLogger)
```

Arbre de trace idéal :

```
interaction
  llm_request
    tool
      tool.blocked_on_user
      hook(pre)
      tool.execution
      hook(post)
  subagent
    interaction
      llm_request
        tool
```

### 5. Câblage parent-enfant insuffisamment stable

Le span interaction existe déjà, mais de nombreux spans en cours d'exécution sont accrochés sous la racine de la session comme des frères, plutôt que comme des enfants du span interaction.

- L'arbre d'appels est plat
- La relation causale entre les nœuds n'est pas intuitive
- L'expérience de navigation d'un tour utilisateur vers les appels internes llm/tool/hook/subagent n'est pas fluide

## Impact

- Les traces ont une valeur de base, mais ne suffisent pas pour le débogage au niveau du workflow
- Impossible de répondre directement à « ce tour a-t-il été lent à cause de l'attente utilisateur, du hook, ou de l'exécution réelle de l'outil »
- Impossible de reconstituer le processus d'exécution d'un subagent en un sous-arbre de trace lisible
- Les problèmes de hook sont intégrés dans le span de l'outil, rendant les limites floues
- L'arbre dans Jaeger / Tempo / ARMS est plus plat et plus difficile à lire que celui de claude-code

---

## Analyse de la réutilisation de la solution claude-code

> Basé sur une comparaison approfondie du code source de claude-code le 2026-05-13

### Architecture de tracing de claude-code

claude-code implémente un **système de gestion de spans unifié basé sur deux ALS** dans `src/utils/telemetry/sessionTracing.ts` :

```
                    interactionContext (ALS)          toolContext (ALS)
                          │                                │
                          ▼                                ▼
              ┌─────────────────────┐           ┌─────────────────────┐
              │  span interaction   │           │    span tool        │
              │  (racine session)   │           │  (enfant de intxn)  │
              └─────────────────────┘           └─────────────────────┘
                   ▲ parent de                       ▲ parent de
                   │                                 │
           ┌───────┴───────┐              ┌──────────┼──────────┐
           │               │              │          │          │
      llm_request      tool          blocked    execution    hook
                                     _on_user
```

**Mécanismes principaux :**

| Mécanisme   | Implémentation                                                                                                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double ALS  | `interactionContext` stocke le span interaction en cours ; `toolContext` stocke le span tool en cours                                                                                     |
| Résolution parent | Chaque type de span a un ALS source codé en dur pour obtenir son parent : `llm_request`/`tool` depuis `interactionContext` ; `blocked_on_user`/`execution`/`hook` depuis `toolContext` ; `hook` a un fallback vers `interactionContext` |
| Cycle de vie | enterWith injection → exécution du span → enterWith(undefined) nettoyage                                                                                                                 |
| Recherche de span | Les spans non stockés dans ALS (comme `blocked_on_user`) sont retrouvés via la Map `activeSpans` par `span.type`                                                                          |
| Gestion mémoire | Les spans détenus par ALS utilisent WeakRef ; les spans non détenus par ALS utilisent strongRef pour éviter le GC ; nettoyage automatique TTL 30min                                      |
**Cycle de vie complet du span tool de claude-code** (`toolExecution.ts`) :

```
startToolSpan(name, attrs)                    // → toolContext.enterWith(spanCtx)
  startToolBlockedOnUserSpan()                // → parent = toolContext.getStore()
    [résolution des permissions / invite utilisateur]
  endToolBlockedOnUserSpan(decision, source)
  startToolExecutionSpan()                    // → parent = toolContext.getStore()
    [tool.call()]
  endToolExecutionSpan({ success })
endToolSpan(result)                           // → toolContext.enterWith(undefined)
```

**Span hook de claude-code** (`hooks.ts`) :

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [exécution parallèle des hooks]
endHookSpan(span, { success, blocking, ... })
```

### Architecture existante de qwen-code vs claude-code

#### Différence fondamentale : deux chemins disjoints de création de spans

C'est le problème architectural le plus critique de qwen-code actuellement :

| Couche              | Fichier                | Utilisation                                                                                   | Résolution du parent                                       |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Couche session-tracing | `session-tracing.ts`   | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan`    | Récupère explicitement le parent depuis l'ALS `interactionContext` |
| Couche tracer       | `tracer.ts`            | `withSpan` / `startSpanWithContext`                                                           | Récupère le parent depuis `context.active()`, fallback vers la racine de session |

**Appels réels à l'exécution :**

- `startInteractionSpan` → **déjà intégré** (`client.ts` ligne 956), écrit dans l'ALS `interactionContext`
- `startLLMRequestSpan` / `endLLMRequestSpan` → **non intégré** ; l'exécution utilise `withSpan('api.generateContent', ...)` (dans `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **non intégré** ; l'exécution utilise `withSpan('tool.${name}', ...)` (dans `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **non intégré**

**Conséquence :**

`getParentContext()` de `withSpan` vérifie d'abord `context.active()` (contexte natif OTel). S'il ne trouve pas de span actif, il retourne au contexte racine de la session. Il **ne lit absolument pas** l'ALS `interactionContext`.

Ainsi, le span d'interaction et les spans LLM/tool deviennent des **siblings au même niveau** sous la racine de session, au lieu d'une arborescence parent-enfant :

```
session-root
  ├── interaction         (venant de session-tracing, écrit dans l'ALS interactionContext)
  ├── api.generateContent (venant de withSpan, ne lit pas interactionContext → rattaché à session-root)
  ├── tool.Bash           (venant de withSpan, idem)
  └── tool.Read           (venant de withSpan, idem)
```

**Alors que dans claude-code, il n'y a qu'un seul chemin de création de spans (sessionTracing.ts) : tous les spans passent par la même logique de conversion ALS → contexte OTel, donc l'arborescence est complète.**

#### Évaluation point par point de la réutilisabilité

##### 1. Double ALS + résolution explicite du parent — réutilisable, c'est la correction centrale

| Dimension       | claude-code                                           | qwen-code                                    |
| --------------- | ----------------------------------------------------- | -------------------------------------------- |
| Nombre d'ALS    | 2 (`interactionContext` + `toolContext`)              | 1 (`interactionContext`, pas de `toolContext`)   |
| Résolution parent | Chaque type de span spécifie explicitement depuis quel ALS récupérer le parent | `withSpan` passe uniformément par `context.active()` |
| Injection contexte | `trace.setSpan(otelContext.active(), parentCtx.span)` | `withSpan` injecte implicitement via `startActiveSpan` |

**Plan de réutilisation :**

Le fichier `session-tracing.ts` de qwen-code implémente déjà un **modèle de résolution du parent quasiment identique** à celui de claude-code :

```typescript
// qwen-code session-tracing.ts (existe mais non utilisé)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

Ce code est **parfaitement identique** à la logique de `startLLMRequestSpan` de claude-code.

**Chemin de correction central : abandonner les appels `withSpan('api.*')` / `withSpan('tool.*')` dans l'exécution, et les remplacer par les helpers typés de session-tracing.** Inutile de réécrire la couche session-tracing — son API est déjà prête.

Il faut seulement ajouter :

- Un ALS `toolContext` (sur le modèle de claude-code)
- Les types de span `blocked_on_user` et `hook` ainsi que leurs fonctions helpers

##### 2. tool.blocked_on_user — nécessite une adaptation aux différences du flux d'approbation

| Dimension       | claude-code                                | qwen-code                                                                  |
| --------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| Emplacement approbation | Dans `toolExecution.ts`, à l'intérieur du span tool | Dans `coreToolScheduler._schedule()`, avant le span tool                      |
| Mode approbation | Attente synchrone de `resolveHookPermissionDecision()` | Piloté par machine d'état : `validating` → `awaiting_approval` → `scheduled` → `executing` |
| Couverture du span | Le span tool inclut blocked + execution | Le span tool (`withSpan`) ne couvre que l'exécution (à partir de `executeSingleToolCall`) |

**Différence clé :** Le point d'entrée `executeSingleToolCall` de qwen-code vérifie que `toolCall.status !== 'scheduled'` avant de continuer — autrement dit, l'approbation est déjà terminée quand on y arrive. Le `withSpan` du tool span ne peut pas englober l'attente d'approbation.

**Plan d'adaptation (deux options) :**

**Option A — Déplacer le point de départ du tool span (recommandée) :**

Déplacer l'appel `startToolSpan` de `executeSingleToolCall` vers `_schedule`, avant la vérification d'approbation, afin que le tool span couvre l'ensemble du cycle de vie. Lors de l'entrée dans l'état `awaiting_approval`, appeler `startToolBlockedOnUserSpan` ; lorsque l'approbation est terminée (état `scheduled`), appeler `endToolBlockedOnUserSpan`.
```
_schedule():
  startToolSpan(name)                         // ← 新增
    startToolBlockedOnUserSpan()              // ← 新增，进入 awaiting_approval 时
      [状态机等待]
    endToolBlockedOnUserSpan(decision)        // ← 新增，进入 scheduled 时
executeSingleToolCall():
    startToolExecutionSpan()                  // ← 接入已有 helper
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← 需要在 finally 中
```

**方案 B — 保持 tool span 位置不变，单独追踪审批：**

在 `_schedule` 中独立创建 `approval_wait` span（不作为 tool 的 child），挂到 interaction 下。好处是改动更小，坏处是与 claude-code 模型不一致、trace 树可读性差。

**建议采用方案 A**，因为：

- 与 claude-code 的 trace 树结构一致
- trace 上一个 tool 节点就能看到"等了多久 + 执行了多久"
- 状态机驱动的特性只影响 span start/end 的触发时机，不影响 parent-child 建模

##### 3. hook span — 可直接复用

| 维度          | claude-code                         | qwen-code                                                            |
| ------------- | ----------------------------------- | -------------------------------------------------------------------- |
| hook 执行入口 | `executeHooks()` in `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` via `hookEventHandler.ts` |
| 现有记录方式  | OTel span + Perfetto span           | `HookCallEvent` → `QwenLogger` (无 OTel)                             |
| parent        | `toolContext ?? interactionContext` | —                                                                    |

**复用方案：**

1. 在 `session-tracing.ts` 新增 `startHookSpan` / `endHookSpan`（parent = `toolContext ?? interactionContext`，与 claude-code 一致）
2. 在 `coreToolScheduler.ts` 的 `executeSingleToolCall` 中，pre/post hook 调用前后分别 start/end hook span
3. 保留现有 `logHookCall` 事件记录（两套并行，不互斥）

改动量低，不影响现有 hook 逻辑。

##### 4. tool.execution — 已有 helper，只需接线

qwen-code 的 `startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` 已经完整实现，只需在 `executeSingleToolCall` 中调用：

```typescript
// coreToolScheduler.ts executeSingleToolCall 内部
const toolSpan = startToolSpan(toolName, attrs);
// ... hook pre ...
const execSpan = startToolExecutionSpan(toolSpan);
try {
  // ... invocation.execute() ...
  endToolExecutionSpan(execSpan, { success: true });
} catch (e) {
  endToolExecutionSpan(execSpan, { success: false, error: e.message });
}
// ... hook post ...
endToolSpan(toolSpan);
```

注意：qwen-code 的 `startToolExecutionSpan` 接收显式 `parentToolSpan` 参数，而 claude-code 的是从 `toolContext` ALS 隐式获取。这不影响功能，只是风格差异。如果引入 `toolContext` ALS，可以统一改为隐式获取。

##### 5. subagent trace tree — 双方都不完整，不建议直接复用

| 维度            | claude-code                                                             | qwen-code                                            |
| --------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| OTel trace 传播 | **无** — subagent 的 interaction 是新 root                              | **无** — subagent 无显式 trace 传播                  |
| 身份关联        | Perfetto metadata（agent process/thread）+ `teammateContextStorage` ALS | `subagentNameContext` ALS + `SubagentExecutionEvent` |
| 并发隔离        | OTel ALS 有泄漏风险（`enterWith` 是进程级，并发 subagent 会互覆盖）     | 同样的风险                                           |

claude-code 在 subagent OTel tracing 上**自己也没解决好**：

- `interactionContext.enterWith()` 是进程级的，并发 subagent 会覆盖彼此的 ALS 值
- 真正的 agent 层级树只存在于 Perfetto（一个 Anthropic 内部 feature-flagged 的系统），不在 OTel 中

**建议：**

- 短期：沿用 qwen-code 现有的 `subagentNameContext` + 事件日志方案
- 中期：在 subagent 启动时创建一个 `subagent` span（parent = 当前 toolContext），并用 `context.with()` 而非 `enterWith()` 来隔离并发 subagent 的 OTel context
- 这是需要独立设计的工作项，不建议直接照搬 claude-code

##### 6. LLM request span — 路径明确

qwen-code 当前在 `loggingContentGenerator.ts` 中用 `withSpan('api.generateContent', ...)` 和 `startSpanWithContext('api.generateContentStream', ...)`。

改为调用 `startLLMRequestSpan` / `endLLMRequestSpan`（session-tracing 层已有实现）即可。streaming 场景需要注意：

- `startLLMRequestSpan` 返回 `Span` 对象
- 需要手动传入 `endLLMRequestSpan(span, metadata)` 终结
- 这与 `startSpanWithContext` 的手动管理模式兼容

### 复用总结

| 改造项                                                                    | 可复用程度                            | 改动量                                        | 优先级 |
| ------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------- | ------ |
| 统一 span 创建路径（废弃 runtime `withSpan`，用 session-tracing helpers） | **核心修复** — 解决 parent-child 断裂 | 中（~5 个调用点）                             | P0     |
| 新增 `toolContext` ALS                                                    | 直接照搬 claude-code 模式             | 低（session-tracing.ts 内部）                 | P0     |
| tool.blocked_on_user span                                                 | 方案 A 需适配状态机                   | 中（\_schedule + executeSingleToolCall 协调） | P1     |
| tool.execution 接线                                                       | helper 已有，只需调用                 | 低（executeSingleToolCall 内 3 行）           | P1     |
| hook span                                                                 | 新增 helper + 调用点                  | 低                                            | P1     |
| LLM request span 切换                                                     | 替换 withSpan 为 typed helper         | 低（2 个调用点）                              | P1     |
| subagent trace tree                                                       | **不建议直接复用** — 需独立设计       | 高                                            | P2     |
### Ordre de mise en œuvre recommandé

```
Phase 1 — Correction de la structure de l'arborescence trace (P0)
├── 1a. session-tracing.ts : Ajout d'ALS toolContext + helpers blocked_on_user / hook span
├── 1b. loggingContentGenerator.ts : withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts : withSpan → startToolSpan/endToolSpan

Phase 2 — Compléter les spans workflow (P1)
├── 2a. coreToolScheduler._schedule : Intégration du span blocked_on_user
├── 2b. coreToolScheduler.executeSingleToolCall : Intégration du span tool.execution
└── 2c. Points d'appel pre/post hook : Intégration du span hook

Phase 3 — Arborescence trace Subagent (P2)
├── 3a. Conception d'une isolation context.with() (alternative à enterWith)
├── 3b. Création d'un sous-span racine subagent au lancement du subagent
└── 3c. Validation du scénario de subagents concurrents
```
