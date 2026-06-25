# Conception de l'arbre de traces des sous-agents (P3 Phase 3)

> Issue #3731 — Phase 3 du traçage hiérarchique de session. Ajoute un span `qwen-code.subagent` pour que les invocations de sous-agents obtiennent une structure de trace isolée et interrogeable au lieu de s’entrelacer silencieusement sous le span parent `qwen-code.interaction`.
>
> S'appuie sur la Phase 1 (#4126), la Phase 1.5 (#4302) et la Phase 2 (#4321).

## Problème

Aujourd'hui, chaque invocation de `AgentTool.execute` s'exécute sous le span `qwen-code.interaction` parent. Trois pathologies :

1. **Les sous-agents concurrents s'entrelacent.** `coreToolScheduler.ts:728` marque `AGENT` comme compatible avec la concurrence — `Promise.all` exécute jusqu'à 10 sous-agents en parallèle. Leurs spans LLM-request / tool / hook se rattachent tous au seul span d'interaction parent partagé, de sorte que les explorateurs de traces ne peuvent pas distinguer « cette requête LLM appartient au sous-agent A » de « celle-ci appartient au sous-agent B ».
2. **Aucun span pour la frontière du sous-agent elle-même.** Il existe un LogRecord `qwen-code.subagent_execution` (émis depuis `agent-headless.ts:268,329`) relié à un span du même nom via `LogToSpanProcessor`, mais c'est un marqueur autonome, pas un parent qui imbrique les spans LLM / tool / hook du sous-agent en dessous.
3. **Les sous-agents fork / background flottent librement.** Les chemins fire-and-forget (`runInForkContext` / background) survivent au `AgentTool.execute` parent et émettent des spans à travers plusieurs tours utilisateur ultérieurs. Le span de l'outil parent est déjà terminé au moment où ces spans apparaissent, donc `context.active()` d'OTel n'aide pas — ils s'attachent à l'interaction qui était active au moment du déclenchement, ou à aucune.

## Surface existante (aucun changement)

| Composant                          | Emplacement                                                                                                                                                                                         | Pourquoi nous ne touchons pas                                       |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| Site de création (unifié)               | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                              | Point d'entrée unique ; crochet idéal pour les 3 variantes d'invocation      |
| Trois variantes d'invocation           | foreground-named (`runFramed` at `:2154` — awaited), fork (`void runInForkContext(runFramedFork)` at `:1991` — fire-and-forget), background (`void framedBgBody()` at `:1934` — fire-and-forget) | Cycle de vie différent — la conception du span couvre les trois            |
| Concurrence                        | `coreToolScheduler.runConcurrently` (`Promise.all`, cap 10) — driven by `partitionToolCalls` marking AGENT as `concurrent: true`                                                                 | Ce qui rend l'isolation nécessaire                    |
| `runInForkContext` ALS             | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                       | Gardien de fork récursif uniquement — ne propage PAS le contexte OTel |
| ALS d'identité d'agent                 | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                       | Porte déjà `agentId` ; nous l'étendons avec `depth`        |
| `SubagentExecutionEvent` LogRecord | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 downstreams (LogToSpanProcessor span bridge + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                              | Le LogRecord reste ; les downstreams en dépendent                   |

## Hors périmètre (reporté)

- **Agrégation de l'utilisation des tokens par sous-agent** (`gen_ai.usage.*` additionné sur tous les spans LLM à l'intérieur d'un sous-agent). Appartient à la Phase 4 (décomposition des requêtes LLM).
- **Migration du LogRecord `qwen-code.subagent_execution` vers le nouveau span en tant qu'événements de span.** RUM et les métriques sont étroitement couplés au LogRecord ; reporté à un suivi qui pourra renégocier les 3 consommateurs ensemble.
- **Agrégation automatique des coûts.** Même raison — nécessite d'abord l'utilisation des tokens.
- **Suppression du marqueur `concurrent: true` de l'outil AGENT.** La concurrence est correcte ; nous l'instrumentons, nous ne la contraignons pas.

## Références (preuves de décision)

| Source                                                                                                                 | Point clé                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [OTel Trace Spec — Links between spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)        | Verbatim : « La nouvelle Trace liée peut également représenter une opération de traitement de données asynchrone de longue durée initiée par l'une des nombreuses requêtes rapides entrantes. » → les fork/background devraient être des racines liées, pas des enfants.                                                                                                  |
| [OTel GenAI Agent Spans](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (statut : Development) | Nom du span `invoke_agent {gen_ai.agent.name}` ; attributs requis `gen_ai.operation.name`, `gen_ai.provider.name` ; recommandés : `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                                 |
| LangSmith — 25 000 runs / trace cap                                                                                    | Les longues sessions d'agent forcent finalement le découpage des traces ; favorise la conception hybride traceId.                                                                                                                                                                                                                                          |
| [Sentry — distributed tracing](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                 | « Les transactions enfants peuvent survivre aux transactions contenant leurs spans parents » — les enfants avec une vie plus longue sont pris en charge.                                                                                                                                                                                                    |
| claude-code (Anthropic)                                                                                                | Possède une hiérarchie de sous-agents dans le fichier JSON Perfetto local uniquement ; l'exportation OTel est plate. Aucun code portable.                                                                                                                                                                                                                              |
| opencode (sst/opencode)                                                                                                | Utilise l'auto-instrumentation `@effect/opentelemetry` ; explicite `context.with(trace.setSpan(active, span), fn)` pour `withRunSpan`. **Valide le motif d'isolation `context.with`.** Leur avertissement concernant l'enregistrement manuel de `AsyncLocalStorageContextManager` ne s'applique pas — le `NodeSDK` de qwen-code l'enregistre automatiquement. |
## Design — six décisions, chacune justifiée

### D1 — Cycle de vie : l'appelant ouvre, le corps s'exécute dans `context.with(span, fn)`

`agent.ts` (l'appelant) construit la span. Le corps — qu'il soit attendu (`runFramed`) ou lancé sans attente (`runInForkContext` / tâche de fond) — s'exécute dans `runInSubagentSpanContext(span, fn)`, qui appelle `otelContext.with(trace.setSpan(active, span), fn)`.

**Où exactement dans `AgentTool.execute` la span est-elle ouverte ?** Ouvrez-la **juste AVANT la configuration spécifique au type d'invocation** (`createAgentHeadless` / `createForkSubagent` etc.) — ainsi le temps de paramétrage (construction de la config, reconstruction du ToolRegistry, câblage de ContextOverride) est inclus dans la durée de `qwen-code.subagent`. Les opérateurs qui cherchent « pourquoi ce sous-agent est-il lent ? » voient le tableau complet. Le paramétrage est généralement négligeable par rapport au temps LLM, donc ce bruit est acceptable.

Alternative envisagée : ouvrir après le paramétrage, exclure le temps de configuration. Rejetée car la configuration du sous-agent est elle-même un travail imputable au sous-agent — la masquer rend le calcul de la durée totale erroné lorsqu'on additionne toutes les spans des sous-agents.

**Pourquoi pas seulement par le callee** : au moment où le corps du fork ou de la tâche de fond s'exécute réellement, l'appelant est déjà revenu. `otelContext.active()` renvoie alors le contexte ambiant que le runtime asynchrone transporte — ce qui, pour un lancement sans attente en `void` après la fin du parent, n'est pas fiable. La span parente est déjà fermée ; un reparentage après coup est incorrect.

**Pourquoi pas seulement par l'appelant** : pour le premier plan, cela fonctionne parfaitement, mais les spans de fork / tâche de fond doivent continuer à émettre des spans enfants (LLM / outil / hook) après le retour de `AgentTool.execute`. Ces spans enfants ont besoin que `context.active()` renvoie la span du sous-agent — ce qui n'arrive que si le corps s'exécute explicitement dans `context.with(subagentSpan, body)`.

Les deux extrémités sont nécessaires. **Le design fait le pont** : l'appelant crée la span + une stratégie de traceId selon le type d'invocation, puis passe la main via `runInSubagentSpanContext`.

### D2 — traceId hybride : premier plan = span enfant, fork/tâche de fond = nouvelle traceId + Link

| Type d'invocation | Parent                      | TraceId                 | Pourquoi                                                                                                                                                                          |
| ----------------- | --------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`      | enfant de la span outil de l'appelant | hérite du traceId parent | Comportement par défaut d'OTel ; l'appelant englobe complètement le callee temporellement                                                                                        |
| `fork`            | span racine liée            | nouveau traceId             | L'appelant revient immédiatement ; le fork s'exécute sur plusieurs interactions ultérieures. La spécification OTel recommande textuellement le Link pour cela. Évite de gonfler la durée / la taille de la trace parente. |
| `background`      | span racine liée            | nouveau traceId             | Même raisonnement que pour fork.                                                                                                                                                      |

**Charge utile du Link** :

```ts
tracer.startSpan(
  'qwen-code.subagent',
  {
    kind: SpanKind.INTERNAL,
    links: [
      {
        context: invokerSpanContext,
        attributes: { 'qwen-code.link.kind': 'invoker' },
      },
    ],
  } /* contexte explicite = racine, n'hérite pas du contexte actif */,
);
```

Interrogabilité multi-trace via l'identifiant de session : `gen_ai.conversation.id` est défini sur chaque span de sous-agent (premier plan et racine liée), donc une requête ARMS par `session.id` renvoie à la fois la trace de l'interaction parente ET les traces racines liées des sous-agents. Le Link lui-même apparaît dans l'interface de la trace parente sous la forme « Spawned: subagent X (other trace) », ce qui permet la navigation.

**Pourquoi pas toujours enfant** : un sous-agent de fond de 4 h gonfle la durée murale de la trace parente à 4 h ; la taille de la trace dépasse les limites de certains backends (la limite de 25 000 exécutions de LangSmith est la contrainte documentée la plus claire). Les sous-agents de premier plan que l'utilisateur attend réellement n'ont pas ce problème car ils sont temporellement inclus.

**Pourquoi pas toujours racine liée** : le premier plan brise l'arbre de trace naturel. Une invite utilisateur qui exécute un sous-agent Explore synchrone DOIT montrer un seul arbre, pas deux traces liées.

### D3 — TTL : conscient du type, sous-agent fork/tâche de fond = 4 h, les autres = 30 min

`session-tracing.ts:124` définit `SPAN_TTL_MS = 30 * 60 * 1000`. Le balayage aux lignes `:144-152` traite déjà spécifiquement `tool.blocked_on_user` pour y apposer `decision: 'aborted' + source: 'system'`. Il est déjà conscient du type dans l'esprit.

**Changement** : introduire un TTL par type :

```ts
const SPAN_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30 min
const SPAN_TTL_MS_LONG = 4 * 60 * 60 * 1000; // 4 h

function ttlFor(ctx: SpanContext): number {
  if (
    ctx.type === 'subagent' &&
    ctx.attributes['qwen-code.subagent.invocation_kind'] !== 'foreground'
  ) {
    return SPAN_TTL_MS_LONG;
  }
  return SPAN_TTL_MS_DEFAULT;
}
```
À l'expiration du TTL, les spans du sous-agent sont marquées :

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Pourquoi pas 30 minutes fixes** : les sous-agents légitimes longs (analyse de gros dépôts, builds lents, tâches de recherche approfondie) sont mal marqués comme expirés par TTL. 4h couvre le 99e centile sans être si laxiste que de véritables blocages passent inaperçus.

**Pourquoi pas sans TTL** : un crash de processus / OOM / kill -9 → la span reste dans la Map `activeSpans` pour toujours. Le filet de sécurité de 30 minutes protège contre cela ; les sous-agents fork/background ont simplement besoin d'une fenêtre plus large, pas d'une suppression.

**D'où viennent les 4h** : limite supérieure pragmatique pour les tâches d'agent non triviales (recherche approfondie longue / analyse de grande base de code). Configurable via une constante si les données de production montrent que nous avons tort.

### D4 — Rétention des LogRecord : conserver l'émission, ignorer le pont LogToSpanProcessor

Le LogRecord `SubagentExecutionEvent` a 3 consommateurs en aval (vérifié par audit du dépôt) :

| Consommateur                                                                           | Position                                          | Action                                                                                  |
| -------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → bridge span `qwen-code.subagent_execution`     | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Ignorer ce pont** pour l'événement sous-agent — la nouvelle span `qwen-code.subagent` le remplace |
| QwenLogger RUM ingestion (Aliyun internal stats)                                       | `qwen-logger.ts:573-574`                          | Conserver — RUM ne voit pas les spans OTel, seulement les LogRecords                                      |
| `recordSubagentExecutionMetrics` Counter                                               | `metrics.ts:829`                                  | Conserver — le consommateur métrique est indépendant du pont de trace                                   |

**Saut de pont** (le seul changement dans LogToSpanProcessor) :

```ts
// log-to-span-processor.ts — inside onEmit, after deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // covered by native qwen-code.subagent span
]);
if (skipBridge.has(eventName)) return;
```

**Impact sur le consommateur de trace** : les tableaux de bord qui filtrent sur le nom de span `qwen-code.subagent_execution` commencent à renvoyer zéro résultat. Ils doivent être mis à jour vers `qwen-code.subagent`. À noter dans les notes de version.

**Pourquoi ne pas supprimer le LogRecord** : c'est l'entrée pour RUM et les métriques. Le supprimer est une refactorisation à 3 systèmes ; hors de portée ici.

**Pourquoi ne pas conserver les deux** : la trace montrerait deux spans par sous-agent (`qwen-code.subagent` + `qwen-code.subagent_execution`) transportant des informations qui se chevauchent — déroutant pour les opérateurs lisant les traces, volume de span en double.

### D5 — Nom de span + attributs : conformité hybride à la spécification, préfixé par le fournisseur pour les extensions

**Nom de span** : `qwen-code.subagent` (correspond à la convention de la base de code Phase 1/2 : `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

La spécification OTel GenAI dit que le nom de span canonique est `invoke_agent {gen_ai.agent.name}` — mais **dit aussi** que « les systèmes/cadriciels GenAI individuels PEUVENT spécifier des formats de nom de span différents ». Nous utilisons notre propre nom et définissons `gen_ai.operation.name='invoke_agent'` afin que les outils conscients de la spécification identifient toujours la span. Les opérateurs lisant notre arbre de traces voient une dénomination cohérente `qwen-code.*`.

**Type de span** : `INTERNAL` (invocation de sous-agent en cours, selon la spécification).

**Ensemble d'attributs** :

| Catégorie                                                         | Attribut                                       | Source                                                               | Notes                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requis par la spécification**                                                | `gen_ai.operation.name='invoke_agent'`          | littéral                                                              | requis par la spécification                                                                                                                                                                    |
| **Requis par la spécification**                                                | `gen_ai.provider.name='qwen-code'`              | littéral                                                              | requis par la spécification ; ambigu pour les agents en cours (la spécification l'a écrit pour le fournisseur LLM). Le définir à `'qwen-code'` est l'interprétation la plus honnête                                      |
| **Requis (double émission)**                                         | `gen_ai.agent.id` + `qwen-code.subagent.id`     | `agentContext.agentId`                                               | double émission jusqu'à ce que la spécification atteigne Stable ; supprimer la clé fournisseur plus tard                                                                                                                     |
| **Requis (double émission)**                                         | `gen_ai.agent.name` + `qwen-code.subagent.name` | `agentConfig.subagentType` (ex. `Explore`, `code-reviewer`, `fork`) | même double émission                                                                                                                                                                   |
| **Recommandé par la spécification**                                             | `gen_ai.conversation.id`                        | `config.getSessionId()`                                              | permet les requêtes inter-traces par session ; coexiste avec l'attribut de span existant `session.id` (défini globalement par #4367) — les deux pointent vers le même UUID, en supprimer un lorsque la spécification se stabilise |
| **Recommandé par la spécification**                                             | `gen_ai.request.model`                          | modèle de remplacement si présent                                              | uniquement lorsque le sous-agent remplace le modèle parent                                                                                                                                        |
| **Fournisseur**                                                       | `qwen-code.subagent.invocation_kind`            | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | pilote la stratégie TTL + traceId                                                                                                                                                    |
| **Fournisseur**                                                       | `qwen-code.subagent.is_built_in`                | bool                                                                 | filtre de tableau de bord                                                                                                                                                                 |
| **Fournisseur**                                                       | `qwen-code.subagent.parent_agent_id`            | ALS parent `agentId`                                                 | pour les sous-agents imbriqués + lignée inter-traces                                                                                                                                       |
| **Fournisseur**                                                       | `qwen-code.subagent.depth`                      | profondeur parent + 1 (haut = 0)                                           | détecteur de bug de récursivité                                                                                                                                                           |
| **Fournisseur**                                                       | `qwen-code.subagent.invoking_request_id`        | depuis `agentContext`                                                  | corrélation au niveau de la requête                                                                                                                                                        |
| **Fin de span (spécification)**                                             | `error.type` (en cas d'échec)                       | classe d'erreur                                                          | standard OTel                                                                                                                                                                    |
| **Fin de span (spécification)**                                             | `exception.message` (en cas d'échec)                | `truncateSpanError(error.message)`                                   | standard OTel ; réutilise la troncature Phase 2                                                                                                                                         |
| **Fin de span (fournisseur)**                                           | `qwen-code.subagent.status`                     | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | plus fin que le SpanStatus OTel (qui est OK / ERROR / UNSET)                                                                                                                         |
| **Fin de span (fournisseur)**                                           | `qwen-code.subagent.terminate_reason`           | depuis `SubagentExecutionEvent.terminate_reason`                       | ex. `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                |
| **Fin de span (fournisseur)**                                           | `qwen-code.subagent.result_summary_present`     | bool                                                                 | « le sous-agent a-t-il produit une sortie » — limité                                                                                                                                          |
| **Optionnel (sensible) contrôlé par `includeSensitiveSpanAttributes`** | `gen_ai.input.messages`                         | historique de chat structuré                                              | réutilise la porte #4097                                                                                                                                                              |
| **Optionnel (sensible)**                                           | `gen_ai.output.messages`                        | réponses du modèle                                                      | même porte                                                                                                                                                                        |
| **Optionnel (sensible)**                                           | `gen_ai.system_instructions`                    | prompt système                                                        | même porte                                                                                                                                                                        |
| **Optionnel (sensible)**                                           | `gen_ai.tool.definitions`                       | schémas d'outils                                                         | même porte                                                                                                                                                                        |
**Correspondance SpanStatus** :

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` ou `'aborted'` → `SpanStatus { code: UNSET }` (conforme à la convention Phase 2)

**Pourquoi double émission sur `id` + `name`** : la spécification est en Développement (une étape plus tôt qu'Expérimental). `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` existe pour l'opt-in. Les noms d'attributs de la spécification peuvent être renommés avant Stable. La double émission est le même schéma que Phase 2 a utilisé pour `call_id` → `tool.call_id` ; supprimez la clé du fournisseur lorsque la spécification atteint Stable.

**Pourquoi `qwen-code.subagent.*` (pas `qwen.subagent.*`)** : toutes les clés existantes préfixées par le fournisseur dans `constants.ts` utilisent `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call`, etc.). La cohérence interne prime sur la préférence de convention de nommage OTel, puisque les opérateurs interrogent ARMS par préfixe.

**Cardinalité** : les attributs de span ne sont pas des étiquettes de métrique dans OTel ; les attributs à clé UUID (`id`, `parent_agent_id`, `invoking_request_id`) sont sûrs au niveau de la span. Ne les promouvez pas ultérieurement en étiquettes de métrique.

**~10-15 attributs par span** (selon le type d'invocation, l'échec, l'imbrication). Même ordre que `qwen-code.tool`.

### D6 — Champ `AgentContext.depth` ajouté directement

`AgentContext` (`agent-context.ts:32`) **n'est pas exporté** — seulement les helpers (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`) le sont. Aucune rupture descendante au niveau TypeScript. Les 6 lecteurs connus via `getCurrentAgentId()` ne lisent que `agentId` ; ajouter `depth?: number` leur est invisible.

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // NEW — default 0 in readers
}
```

`runWithAgentContext` utilise déjà le spread `{ ...current, agentId }`, donc `depth` survit inchangé aux sites d'appel existants. **Mettre à jour `runWithAgentContext` pour auto-incrémenter depth en interne** — aucun appelant n'a besoin de connaître depth :

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // auto-increment
  };
  return agentContextStorage.run(next, fn);
}
```

Sous-agent de premier niveau : pas de parent ALS → `depth: 0`. Imbriqué : parent depth+1.

Un nouveau petit accesseur `getCurrentAgentDepth(): number` retourne `agentContextStorage.getStore()?.depth ?? 0` — utilisé par `startSubagentSpan` pour renseigner `qwen-code.subagent.depth`.

**Pourquoi pas un ALS séparé juste pour la télémétrie** : cela dupliquerait la même forme de contexte que nous maintenons déjà. Mauvais. Réutiliser l'existant.

## API Helper (`session-tracing.ts`)

```ts
// constants.ts
export const SPAN_SUBAGENT = 'qwen-code.subagent';

// session-tracing.ts
export interface StartSubagentSpanOptions {
  agentId: string;
  subagentName: string;
  invocationKind: 'foreground' | 'fork' | 'background';
  isBuiltIn: boolean;
  parentAgentId?: string;
  depth: number;
  invokingRequestId?: string;
  sessionId: string;
  modelOverride?: string;
  invokerSpanContext?: SpanContext; // required for fork / background (Link source)
}

export interface SubagentSpanMetadata {
  status: 'completed' | 'failed' | 'cancelled' | 'aborted';
  terminateReason?: string;
  resultSummaryPresent?: boolean;
  error?: string;
  errorType?: string;
}

export function startSubagentSpan(opts: StartSubagentSpanOptions): Span;
export function endSubagentSpan(
  span: Span,
  metadata: SubagentSpanMetadata,
): void;
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T>;
```

`runInSubagentSpanContext` est la primitive d'isolation :

```ts
export function runInSubagentSpanContext<T>(
  span: Span,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = trace.setSpan(otelContext.active(), span);
  return otelContext.with(ctx, fn);
}
```

`startSubagentSpan` bifurque en interne sur `invocationKind` :

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // Child of current active span (caller's tool span)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background: linked root span
  return tracer.startSpan(SPAN_SUBAGENT, {
    kind: SpanKind.INTERNAL,
    attributes,
    links: opts.invokerSpanContext
      ? [
          {
            context: opts.invokerSpanContext,
            attributes: { 'qwen-code.link.kind': 'invoker' },
          },
        ]
      : undefined,
    root: true, // forces new traceId; ignores active context as parent
  });
}
```

## Câblage du cycle de vie

### Foreground nommé (le chemin commun)

```ts
// agent.ts:~2154
// Pull parent ALS frame to set parentAgentId on the span. The new child's
// depth is computed inside runWithAgentContext automatically (D6) — we
// read it via getCurrentAgentDepth() once we're INSIDE the child ALS
// frame. Two-step:
const parentAgentId = getCurrentAgentId();  // BEFORE entering child frame

// ... existing runFramed call enters runWithAgentContext(hookOpts.agentId, ...) ...

// INSIDE runFramed, we can read child's depth:
//   const depth = getCurrentAgentDepth();
//
// Practical placement: thread `depth` as a closure variable, set after
// runWithAgentContext takes effect — OR compute it as
// `(getCurrentAgentDepth() outside) + 1` from the caller side (simpler).
const depth = getCurrentAgentDepth();  // outside frame; child will be this + 1
// (set qwen-code.subagent.depth = depth in startSubagentSpan args)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext omitted — foreground inherits naturally via context.with
});
let metadata: SubagentSpanMetadata = { status: 'aborted' };
try {
  await runInSubagentSpanContext(span, () =>
    runFramed(() => this.runSubagentWithHooks(...)),
  );
  metadata = { status: 'completed' /* + resultSummaryPresent */ };
} catch (error) {
  metadata = {
    status: signal.aborted ? 'aborted' : 'failed',
    error: error instanceof Error ? error.message : String(error),
    errorType: error?.constructor?.name,
  };
  throw error;
} finally {
  endSubagentSpan(span, metadata);
}
```
### Fork (fire-and-forget)

```ts
const invokerSpanContext = trace.getSpan(otelContext.active())?.spanContext();
const span = startSubagentSpan({
  ..., invocationKind: 'fork', invokerSpanContext,
});
void runInForkContext(() =>
  runInSubagentSpanContext(span, async () => {
    let metadata: SubagentSpanMetadata = { status: 'aborted' };
    try {
      await runFramedFork();
      metadata = { status: 'completed' };
    } catch (error) {
      metadata = {
        status: signal.aborted ? 'aborted' : 'failed',
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      endSubagentSpan(span, metadata);
    }
  }),
);
// AgentTool.execute retourne immédiatement FORK_PLACEHOLDER_RESULT ;
// le span persiste sur les interactions ultérieures de la session parente.
```

### Arrière-plan

Même forme que fork, avec `invocationKind: 'background'` et `bgEventEmitter` au lieu de `eventEmitter`. TTL de 4 h (identique à fork — règle de type D3).

## Isolation concurrente — la garantie phare

Trois invocations simultanées de sous-agent issues d'une même requête utilisateur (le modèle émet 3 blocs `AGENT tool_use` → `coreToolScheduler.runConcurrently` exécute 3 `executeSingleToolCall` en parallèle ; chacune ouvre son propre span `qwen-code.tool` selon la Phase 2) :

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [agent call #A]
│  └─ qwen-code.subagent (A, premier plan)   [traceId=T0, enfant]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [agent call #B]
│  └─ qwen-code.subagent (B, premier plan)   [traceId=T0, enfant]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [agent call #C]
   └─ qwen-code.subagent (C, fork)            [traceId=T1, racine liée]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, peut émettre des heures plus tard]
```

`context.with(span, runX)` pour chacun de A, B, C s'exécute simultanément. `AsyncLocalStorageContextManager` (déjà enregistré automatiquement par NodeSDK dans `sdk.ts:273`) agit par fibre ; aucune interférence. Les spans enfants LLM / outil / hook de chaque sous-agent voient `span` via `context.active()` dans leur propre chaîne asynchrone.

Le fork (C) est une trace séparée — ses spans enfants héritent de `traceId=T1` même lorsqu'ils sont émis lors de plusieurs interactions ultérieures de la session parente. La requête ARMS par `session.id` retourne à la fois T0 et T1 ; le Link depuis la racine de T1 vers le span `qwen-code.tool` invoquant C fournit une navigation explicite.

## Fichiers à modifier

| Fichier                                                                                 | Changement                                                                                                                                                                                         | LOC est. |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `packages/core/src/telemetry/constants.ts`                                              | Ajouter les constantes `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, les clés d'attributs                                                                                                                   | +8       |
| `packages/core/src/telemetry/session-tracing.ts`                                        | Ajouter `startSubagentSpan` (branche premier plan/racine liée), `endSubagentSpan`, `runInSubagentSpanContext`, types ; étendre l'union `SpanType` avec `'subagent'` ; étendre la passe TTL avec `ttlFor(ctx)` | +120     |
| `packages/core/src/telemetry/log-to-span-processor.ts`                                  | Liste de contournement pour éviter le pontage de `qwen-code.subagent_execution`                                                                                                                     | +6       |
| `packages/core/src/telemetry/index.ts`                                                  | Réexporter les nouveaux helpers + types                                                                                                                                                            | +6       |
| `packages/core/src/agents/runtime/agent-context.ts`                                     | Ajouter `depth?: number` à `AgentContext` + accesseur `getCurrentAgentDepth()`                                                                                                                      | +12      |
| `packages/core/src/tools/agent/agent.ts`                                                | Envelopper les 3 chemins d'exécution (premier plan/fork/arrière-plan) dans `runInSubagentSpanContext` avec try/catch/finally                                                                       | +60      |
| `packages/core/src/telemetry/session-tracing.test.ts`                                   | Nouveau `describe('subagent spans')` : start/end, enfant vs racine liée, propagation de contexte, profondeur, TTL par type, fin idempotente, NOOP sous SDK non initialisé                           | +120     |
| `packages/core/src/telemetry/log-to-span-processor.test.ts`                             | Vérifier que la liste de contournement court-circuite le pontage de subagent_execution                                                                                                             | +20      |
| `packages/core/src/tools/agent/agent.test.ts`                                           | De bout en bout : 3 sous-agents concurrents obtiennent chacun une sous-arborescence isolée ; les spans du fork héritent d'un nouveau traceId via Link ; cycle de vie de l'arrière-plan               | +80      |
Total : 9 fichiers, ~430 LOC. Plus volumineux que les commits typiques de la Phase 2 mais justifié — la modification TTL touche un fichier séparé, le contournement de LogToSpanProcessor est un fichier séparé, et les fichiers de test doublent. Diviser aboutirait à une surface de télémétrie incomplète.

Si la révision conteste la taille : diviser en 2 PR — (A) helpers de télémétrie + tests, (B) câblage dans `agent.ts` + tests e2e. Les helpers livrés en premier ne modifient pas le comportement à l'exécution.

## Stratégie de test

| Test                                                                         | Ce que cela prouve                                                  |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                   | Chemin d'enfant                                                   |
| `startSubagentSpan fork creates new traceId + Link to invoker`               | Chemin de racine liée                                                |
| `runInSubagentSpanContext propagates span through awaits / Promise.all`      | Primitif d'isolation                                             |
| `3 concurrent subagent spans don't share children`                           | Garantie de concurrence phare                                      |
| `nested subagent records depth + parentAgentId`                              | Métadonnées d'imbrication                                                |
| `endSubagentSpan status mapping (completed / failed / cancelled / aborted)`  | Taxonomie de statut                                                 |
| `endSubagentSpan dual-emits gen_ai.agent.id + qwen-code.subagent.id`         | Émission double conforme à la spécification                                      |
| `fork lifecycle: span survives AgentTool.execute return`                     | Exactitude du « fire-and-forget »                                     |
| `TTL: subagent fork stays past 30min, gets stamped + ended at 4h`            | TTL conscient du type                                                  |
| `TTL: foreground subagent at 30min gets default sweep`                       | Le TTL ne s'étend pas trop                                        |
| `LogToSpanProcessor skips qwen-code.subagent_execution but still RUM-emits`  | Le contournement du bridge fonctionne                                               |
| `runConcurrently of 3 agent tool calls produces 3 distinct subagent spans`   | De bout en bout au niveau de l'ordonnanceur                                   |
| `failed subagent sets exception.message + error.type + SpanStatus=ERROR`     | Chemin d'erreur standard OTel                                        |
| `opt-in attrs gated on includeSensitiveSpanAttributes`                       | Réutilise correctement la barrière de #4097                      |
| `startSubagentSpan returns NOOP_SPAN when SDK is uninitialized`              | Correspond à la discipline NOOP de la Phase 1/2 ; les appels en aval restent sûrs              |
| `fork span Link.context matches invoker tool span's spanContext`             | La navigation inter-trace fonctionne de bout en bout                        |
| `runWithAgentContext auto-increments depth: parent=0, child=1, grandchild=2` | La comptabilité de profondeur est correcte sans coopération de l'appelant         |

## Cas limites

| Cas                                                                                                                    | Gestion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Subagent à l'intérieur d'un outil à l'intérieur d'un subagent (profondeur > 1)                                          | L'attribut `depth` suit le compte ; recommander un `debugLogger.warn` doux à profondeur ≥ 5 (détecteur de récursion infinie)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Subagent engendré pendant `awaiting_approval` d'un outil parent                                                            | La span du subagent est un enfant de la span de l'outil AGENT ; le `tool.blocked_on_user` de l'outil AGENT est un frère, pas un parent — les deux sont enfants de la span de l'outil AGENT. L'arbre reste correct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `signal.aborted` en plein milieu d'un subagent                                                                                           | Le callback de `runInSubagentSpanContext` lève une exception ou résout ; `finally` définit `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Fork encore vivant lorsque la session parent se termine                                                                               | Le TTL de 4h se déclenche ; attributs sentinelles `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `endSubagentSpan` appelé deux fois                                                                                          | Idempotent — vérifie la map `activeSpans` ; le deuxième appel ne fait rien (correspond au motif de la Phase 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| L'appel LLM d'un subagent utilise un modèle différent de celui du parent                                                                  | `gen_ai.request.model` défini sur la span du subagent ; la sous-span de la requête LLM enregistre AUSSI le modèle — pas de conflit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Une exception dans le prélude d'un subagent frère s'échappe de `attemptExecutionOfScheduledCalls`                                                | Atterrit dans le bloc `catch` de `handleConfirmationResponse` récemment corrigé de la Phase 2, qui est EN DEHORS du `try` — pas attribué à la span de l'outil confirmé. La span du subagent se ferme correctement via son propre `try/finally`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Fork et foreground simultanés à partir d'un même parent                                                                            | Le foreground hérite du traceId T0, le fork obtient T1. Les deux propagent correctement leur contexte indépendamment. La span de l'outil parent se termine quand son travail synchrone retourne ; la span du fork (trace séparée) continue de vivre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| La span du fork commence dans le flux synchrone de l'appelant mais le corps s'exécute plus tard                                                                | `startSubagentSpan` est appelée AVANT `void runInForkContext(...)` donc la span (et son Link vers l'invocateur) est capturée alors que le spanContext de l'invocateur est encore lisible. La durée de la span inclut donc tout délai d'ordonnancement de la file des microtâches avant que le corps ne commence réellement — typiquement <1 ms ; si la production montre des écarts non négligeables, un attribut séparé `qwen-code.subagent.scheduling_delay_ms` peut être ajouté (question ouverte)                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| SDK non initialisé (télémétrie désactivée)                                                                                | `startSubagentSpan` retourne prématurément NOOP_SPAN (correspond à tous les autres helpers de Phase 1/2). `runInSubagentSpanContext(NOOP_SPAN, fn)` appelle quand même `fn` normalement. `endSubagentSpan(NOOP_SPAN, …)` ne fait rien                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Les spans de bridge de log du fork (`tool_call`, `api_request`, etc.) utilisent un traceId dérivé de la session tandis que les spans natives du fork utilisent T1 | Comportement préexistant — les spans de bridge de log utilisent toujours `deriveTraceId(sessionId)`, les spans natives utilisent le contexte OTel. La divergence est invisible à l'intérieur d'une trace mais signifie qu'une recherche ARMS par traceId sur T1 n'inclura pas les enfants de bridge de log du fork. Hors du périmètre de cette PR ; signalé comme question ouverte #5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Les parents de la span du hook `SubagentStart` diffèrent selon qu'il s'agit d'un foreground ou d'un background                                                       | Le foreground déclenche `fireSubagentStartEvent` à l'intérieur de `runSubagentWithHooks` → déjà à l'intérieur de `runInSubagentSpanContext`, donc la span du hook est parentée sous `qwen-code.subagent`. Le background le déclenche AVANT le wrapping `runWithSubagentSpan` (donc la span du subagent n'existe pas encore), donc sa span du hook est parentée sous l'outil AGENT `qwen-code.tool`. Les opérateurs qui interrogent « les spans de hook sous les spans de subagent » doivent s'attendre à ce que le `SubagentStart` du background manque dans cette vue. Déplacer le déclenchement du hook du background à l'intérieur de `framedBgBody` est mécaniquement simple (la mutation `contextState` atteint `bgSubagent.execute` de toute façon), mais cela change la sémantique visible par l'utilisateur : aujourd'hui le hook se déclenche de manière synchrone avant que `AgentTool.execute` ne retourne le message « Agent de fond lancé », donc tout travail de configuration synchrone effectué par le hook a lieu dans le tour bloquant de l'utilisateur ; le déplacer ferait que le hook se déclenche de manière détachée après le retour du message de lancement. Reporté en attendant une décision délibérée sur la sémantique préférée.
## Rollback

Le changement est additif au niveau OTel — les tableaux de bord existants qui ne filtrent pas sur les noms de spans liés aux sous-agents continuent de fonctionner. Les consommateurs de traces qui regroupent par span parent verront de nouveaux nœuds `qwen-code.subagent` entre `qwen-code.tool` et `qwen-code.llm_request` ; documenter dans les notes de version.

Le changement affectant le comportement est le saut du LogToSpanProcessor — les tableaux de bord qui consommaient auparavant la span `qwen-code.subagent_execution` renvoient zéro. Atténuation : conserver le LogRecord intact (RUM + métriques le voient toujours) ; seul le pont de span est supprimé. Les requêtes existantes basées sur les logs ne sont pas affectées.

Chemin de rollback : annuler la seule PR. Les nouvelles aides de span ne sont invoquées que depuis `agent.ts` ; supprimer le câblage + le saut LogToSpanProcessor restaure le comportement antérieur 1:1.

## Implications d'échantillonnage

| Invocation                                       | Source de décision d'échantillonnage                                     |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `foreground` (span enfant, même traceId)          | Hérite de la décision d'échantillonnage de la trace parent via un échantillonneur basé sur le parent |
| `fork` / `background` (racine liée, nouveau traceId) | Décision d'échantillonnage indépendante à la création de la racine     |

Pour la valeur par défaut actuelle de qwen-code (selon `tracer.ts:shouldForceSampled()` — parentbased + always_on sinon always_on), chaque span est échantillonnée, donc la divergence n'a pas d'impact. Pour les déploiements utilisant des échantillonneurs probabilistes (par exemple `traceidratio=0.1`), cela signifie :

- Une invite utilisateur peut être échantillonnée (T0 entièrement capturée) mais son fork (T1) peut être abandonné, ou vice versa.
- Les opérateurs lisant la trace parent T0 voient "Lien : sous-agent C (T1)" — cliquer dessus peut donner une erreur 404 si T1 n'a pas été échantillonnée.

Atténuation : documenter pour les opérateurs. Si la capture complète du sous-agent est importante, forcer l'échantillonnage pour fork/background via un futur bouton de configuration. Hors scope ici.

## Attributs sensibles (intégration #4097)

Réutiliser la porte `includeSensitiveSpanAttributes` existante. Lorsqu'elle est vraie, définir sur la span de sous-agent aux hooks de cycle de vie où les données sont disponibles :

| Attribut spéc                    | Source                                                     | Quand défini                                                                                 |
| -------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions`     | invite système rendue depuis `agentConfig` / contexte parent | `startSubagentSpan` (si disponible avant l'ouverture de la span) ou via `setAttributes` tôt dans le corps |
| `gen_ai.tool.definitions`        | déclarations d'outils disponibles pour le sous-agent       | identique à ci-dessus                                                                        |
| `gen_ai.input.messages`          | entrée initiale passée au sous-agent (invite + historique supplémentaire) | au début du corps                                                                         |
| `gen_ai.output.messages`         | messages de réponse finaux renvoyés par le sous-agent      | dans les métadonnées de `endSubagentSpan`                                                     |

Ces attributs sont déjà tous contrôlés ; le modèle de #4097 est d'appeler l'helper `addSubagentSensitiveAttributes(span, opts)` depuis l'intérieur du corps. Détail d'implémentation — la conception note simplement le point d'intégration.

## Séquencement

- Indépendant de #4367 (attributs de ressource — en révision). Aucune contrainte d'ordre de fusion, mais `gen_ai.conversation.id` sur les spans de sous-agent bénéficie du `session.id` de #4367 déplacé hors ressource. **Recommander de publier #4367 en premier** pour que la source de vérité de `getSessionId()` soit établie.
- Indépendant de la Phase 4 (décomposition de requête LLM / TTFT). La Phase 4 s'attache aux spans `qwen-code.llm_request` qu'elles soient sous un sous-agent ou une interaction. Recommander la Phase 3 avant la Phase 4 pour que les métriques par tentative de la Phase 4 puissent être agrégées par sous-agent.

## Questions ouvertes

1. **`gen_ai.provider.name`** : la spécification l'exige mais écrit la description pour le fournisseur LLM, pas pour le framework d'agent. Le définir sur `'qwen-code'` est la meilleure interprétation ; si une future révision de spécification ajoute une variante `agent.provider.name`, nous devrions basculer.
2. **Nom de span `qwen-code.subagent` vs spec `invoke_agent {name}`** : choix de cohérence interne. Si l'adoption d'outils conscients de GenAI croît et que `invoke_agent ${name}` devient critique pour la découverte automatique, nous pouvons basculer — le nom de span est l'élément le plus renommable dans OTel.
3. **Avertissement doux à une profondeur ≥ 5** : nombre arbitraire. Pourrait être un bouton de configuration. Reporter jusqu'à ce que les données de production montrent un besoin.
4. **La sortie LLM complète de `SubagentExecutionEvent.result` est volumineuse** : aujourd'hui, elle gonfle le volume des LogRecords. Le plan de migration (LogRecord → événements de span) est reporté mais mérite d'être fait une fois que l'agrégation de l'utilisation des tokens arrive dans la Phase 4.
5. **Les spans de pont de log à l'intérieur d'un fork se retrouvent sur le traceId dérivé de la session, pas sur le T1 du fork** : voir les cas limites. Le correctif est le problème plus large « la span d'interaction n'hérite pas du contexte racine de la session » soulevé dans le fil sessionId-vs-traceId — une conception séparée qui affecte toutes les spans natives, pas seulement le sous-agent. Hors scope.
