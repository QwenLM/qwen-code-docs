# Conception de l'arbre de traces des sous-agents (Phase 3 du P3)

> Issue #3731 — Phase 3 du tracing hiérarchique des sessions. Ajoute un span `qwen-code.subagent` afin que les invocations de sous-agents soient isolées et disposent d'une structure de traces requêtable, au lieu d'être entremêlées silencieusement sous le span parent `qwen-code.interaction`.
>
> S'appuie sur la Phase 1 (#4126), la Phase 1.5 (#4302) et la Phase 2 (#4321).

## Problème

Aujourd'hui, chaque exécution de `AgentTool.execute` s'exécute sous le span `qwen-code.interaction` parent. Trois pathologies :

1. **Entremêlement des sous-agents concurrents.** `coreToolScheduler.ts:728` marque `AGENT` comme compatible avec la concurrence — `Promise.all` exécute jusqu'à 10 sous-agents en parallèle. Leurs spans LLM-request / tool / hook s'attachent tous au span d'interaction parent partagé, de sorte que les outils d'exploration des traces ne peuvent pas distinguer « cette requête LLM appartient au sous-agent A » de « celle-ci appartient au sous-agent B ».
2. **Aucun span pour la frontière du sous-agent lui-même.** Il existe un LogRecord `qwen-code.subagent_execution` (émis depuis `agent-headless.ts:268,329`) relié à un span du même nom via `LogToSpanProcessor`, mais c'est un marqueur autonome, pas un parent qui imbrique les spans LLM / tool / hook du sous-agent en dessous.
3. **Les sous-agents fork / background flottent librement.** Les chemins fire-and-forget (`runInForkContext` / background) survivent au `AgentTool.execute` parent et émettent des spans à travers plusieurs tours utilisateur suivants. Le span de l'outil parent est déjà terminé lorsque ces spans apparaissent, donc `context.active()` d'OTel n'aide pas — ils s'attachent à l'interaction qui était active au moment du déclenchement, ou à aucune.

## Surface existante (inchangée)

| Composant                          | Emplacement                                                                                                                                                                                                          | Pourquoi on ne touche pas                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Site de création (unifié)          | `packages/core/src/tools/agent/agent.ts:1147` `AgentTool.execute()`                                                                                                                                                  | Point d'entrée unique ; crochet idéal pour 3 types d'invocation                   |
| Trois types d'invocation           | foreground-named (`runFramed` à `:2154` — awaité), fork (`void runInForkContext(runFramedFork)` à `:1991` — fire-and-forget), background (`void framedBgBody()` à `:1934` — fire-and-forget)                       | Cycle de vie différent — la conception du span couvre les trois                   |
| Concurrence                        | `coreToolScheduler.runConcurrently` (`Promise.all`, limite 10) — piloté par `partitionToolCalls` marquant AGENT comme `concurrent: true`                                                                            | Ce qui rend l'isolation nécessaire                                                 |
| ALS `runInForkContext`             | `packages/core/src/tools/agent/fork-subagent.ts:32` `forkExecutionStorage`                                                                                                                                          | Garde récursive uniquement — ne PROPAGE PAS le contexte OTel                      |
| ALS d'identité d'agent             | `packages/core/src/agents/runtime/agent-context.ts:46` `runWithAgentContext(agentId, ...)`                                                                                                                           | Porte déjà `agentId` ; nous l'étendons avec `depth`                               |
| LogRecord `SubagentExecutionEvent` | `agent-headless.ts:268,329` → `loggers.ts:773` → 3 consommateurs en aval (pont span LogToSpanProcessor + QwenLogger RUM + `recordSubagentExecutionMetrics`)                                                         | Le LogRecord reste ; les consommateurs en aval en dépendent                       |

## Hors du périmètre (reporté)

- **Agrégation de l'utilisation des tokens par sous-agent** (`gen_ai.usage.*` additionné sur tous les spans LLM à l'intérieur d'un sous-agent). Appartient à la Phase 4 (décomposition des requêtes LLM).
- **Migration du LogRecord `qwen-code.subagent_execution` vers le nouveau span en tant qu'événements de span.** RUM et métriques sont étroitement couplés au LogRecord ; reporté à un suivi qui pourra renégocier les 3 consommateurs ensemble.
- **Agrégation automatique des coûts.** Même raison — nécessite d'abord l'utilisation des tokens.
- **Suppression du marqueur `concurrent: true` de l'outil AGENT.** La concurrence est correcte ; nous l'instrumentons, nous ne la contraignons pas.

## Références (preuves des décisions)

| Source                                                                                                                 | Enseignement clé                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Spécification OTel Trace — Liens entre spans](https://opentelemetry.io/docs/specs/otel/overview/#links-between-spans)  | Verbatim : « La nouvelle trace liée peut également représenter une opération de traitement de données asynchrone de longue durée qui a été initiée par l'une des nombreuses requêtes entrantes rapides. » → les fork/background doivent être des racines liées, pas des enfants.                                              |
| [Spans d'agent GenAI OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/gen-ai-agent-spans/) (statut : Développement) | Nom de span `invoke_agent {gen_ai.agent.name}` ; attributs requis `gen_ai.operation.name`, `gen_ai.provider.name` ; recommandés : `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`.                                                                                                                           |
| LangSmith — limite de 25 000 exécutions / trace                                                                          | Les sessions longues d'agent forcent éventuellement une scission de trace ; favorise la conception hybride avec traceId.                                                                                                                                                                                                    |
| [Sentry — tracing distribué](https://docs.sentry.io/concepts/key-terms/tracing/distributed-tracing/)                     | « Les transactions enfants peuvent survivre aux transactions contenant leurs spans parents » — l'enfant avec une durée de vie plus longue est supporté.                                                                                                                                                                        |
| claude-code (Anthropic)                                                                                                | Possède une hiérarchie de sous-agents uniquement dans un fichier local Perfetto JSON ; l'export OTel est plat. Aucun code portable.                                                                                                                                                                                           |
| opencode (sst/opencode)                                                                                                | Utilise l'auto-instrumentation de `@effect/opentelemetry` ; `context.with(trace.setSpan(active, span), fn)` explicite pour `withRunSpan`. **Valide le motif d'isolation `context.with`.** Leur avertissement concernant l'enregistrement manuel de `AsyncLocalStorageContextManager` ne s'applique pas — le `NodeSDK` de qwen-code l'enregistre automatiquement. |

## Conception — six décisions, chacune justifiée

### D1 — Cycle de vie du span : l'appelant ouvre, le callee s'exécute à l'intérieur de `context.with(span, fn)`

`agent.ts` (appelant) construit le span. Le corps — qu'il soit attendu (`runFramed`) ou fire-and-forget (`runInForkContext` / background) — s'exécute à l'intérieur de `runInSubagentSpanContext(span, fn)`, qui appelle `otelContext.with(trace.setSpan(active, span), fn)`.

**Où exactement dans `AgentTool.execute` le span s'ouvre-t-il ?** Ouvrez-le **juste AVANT la configuration spécifique au type d'invocation** (`createAgentHeadless` / `createForkSubagent` etc.) — de sorte que le temps de configuration (construction de la config, reconstruction du ToolRegistry, câblage du ContextOverride) SOIT inclus dans la durée de `qwen-code.subagent`. Les opérateurs qui cherchent « pourquoi ce sous-agent est lent ? » voient l'image complète. La configuration est généralement << temps LLM, donc c'est sans bruit.

Alternative envisagée : ouvrir après la configuration, exclure le temps de config. Rejetée car la configuration du sous-agent est un travail qui lui est attribuable — la cacher rend le calcul de durée totale erroné lors de la somme de tous les spans de sous-agents.

**Pourquoi pas uniquement par le callee** : au moment où le corps du fork/background s'exécute réellement, l'appelant est déjà revenu. `context.active()` d'OTel renvoie alors le contexte ambiant transporté par l'environnement d'exécution asynchrone — ce qui pour un `void` fire-and-forget après la fin du parent est peu fiable. Le span parent est déjà fermé ; un rattachement après coup est incorrect.

**Pourquoi pas uniquement par l'appelant** : le mode foreground fonctionne correctement ainsi, mais les spans fork/background doivent continuer à émettre des spans enfants (LLM / tool / hook) après que `AgentTool.execute` a retourné. Ces spans enfants ont besoin que `context.active()` renvoie le span du sous-agent — ce qui ne se produit que si le corps s'exécute explicitement à l'intérieur de `context.with(subagentSpan, body)`.

Les deux extrémités sont nécessaires. **La conception est le pont** — l'appelant crée le span + la stratégie de traceId selon le type d'invocation, puis passe la main via `runInSubagentSpanContext`.

### D2 — traceId hybride : foreground = span enfant, fork/background = nouveau traceId + Lien

| Type d'invocation | Parent                        | traceId                 | Pourquoi                                                                                                                                                                                                        |
| ----------------- | ----------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `foreground`      | enfant du span de l'outil appelant | hérite du traceId parent | Comportement par défaut d'OTel ; l'appelant englobe complètement le callee temporellement                                                                                                                       |
| `fork`            | span racine lié               | nouveau traceId         | L'appelant retourne immédiatement ; le fork s'exécute à travers plusieurs interactions suivantes. La spécification OTel recommande explicitement le Lien pour ce cas. Évite de gonfler la durée / taille de la trace parente. |
| `background`      | span racine lié               | nouveau traceId         | Même raisonnement que pour le fork.                                                                                                                                                                             |

**Charge utile du Lien** :

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
  } /* contexte explicite = racine, n'hérite pas de l'actif */,
);
```

Possibilité de requêtage inter-traces via l'identifiant de session : `gen_ai.conversation.id` est défini sur chaque span de sous-agent (foreground et racine liée), donc une requête ARMS par `session.id` retourne à la fois la trace de l'interaction parente ET les traces des sous-agents racines liées. Le Lien lui-même apparaît dans l'interface utilisateur de la trace parente comme « Engendré : sous-agent X (autre trace) » pour permettre la navigation.

**Pourquoi pas toujours enfant** : un sous-agent background de 4 heures gonfle la durée chronologique de la trace parente à 4 heures ; la taille de la trace dépasse les limites de plusieurs backends (la limite de 25 000 exécutions de LangSmith est la borne documentée la plus claire). Les sous-agents foreground que l'utilisateur attend réellement n'ont pas ce problème car ils sont temporellement englobés.

**Pourquoi pas toujours racine liée** : le foreground brise l'arbre de traces naturel. Une invite utilisateur qui exécute un sous-agent Explore synchrone DEVRAIT montrer un seul arbre, pas deux traces liées.

### D3 — TTL : conscient du type, sous-agent fork/background = 4h, autres = 30min

`session-tracing.ts:124` définit `SPAN_TTL_MS = 30 * 60 * 1000`. La passe de nettoyage à `:144-152` spécialise déjà `tool.blocked_on_user` pour y apposer `decision: 'aborted' + source: 'system'`. L'esprit est déjà conscient du type.

**Changement** : introduire un TTL par type :

```ts
const SPAN_TTL_MS_DEFAULT = 30 * 60 * 1000; // 30min
const SPAN_TTL_MS_LONG = 4 * 60 * 60 * 1000; // 4h

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

À l'expiration du TTL, les spans de sous-agents reçoivent :

```ts
{
  'qwen-code.span.ttl_expired': true,
  'qwen-code.span.duration_ms': age,
  'qwen-code.subagent.status': 'aborted',
  'qwen-code.subagent.terminate_reason': 'ttl_swept',
}
```

**Pourquoi pas 30min fixe** : des sous-agents longs légitimes (analyse de gros dépôts, builds lents, tâches de recherche approfondie) seraient marqués à tort comme ayant expiré. 4h couvre le 99e percentile sans être trop laxiste pour que les vraies suspensions passent inaperçues.

**Pourquoi pas pas de TTL** : un crash de processus / OOM / kill -9 → le span reste dans la Map `activeSpans` pour toujours. Le filet de sécurité de 30 min protège contre cela ; les sous-agents fork/background ont simplement besoin d'une fenêtre plus large, pas d'une suppression.

**D'où vient 4h** : limite supérieure pragmatique pour des tâches d'agent non triviales (recherche approfondie longue / analyse de grands codebases). Configurable via constante si les données de production montrent que nous avons tort.

### D4 — Rétention des LogRecords : conserver l'émission, ignorer le pont LogToSpanProcessor

Le LogRecord `SubagentExecutionEvent` a 3 consommateurs en aval (vérifié par audit du dépôt) :

| Consommateur                                                                      | Position                                          | Action                                                                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OTel LogRecord → `LogToSpanProcessor` → span pont `qwen-code.subagent_execution`  | `loggers.ts:773` → `log-to-span-processor.ts:346` | **Ignorer ce pont** pour l'événement subagent — le nouveau span `qwen-code.subagent` le remplace       |
| Ingestion QwenLogger RUM (statistiques internes Aliyun)                           | `qwen-logger.ts:573-574`                          | Garder — RUM ne voit pas les spans OTel, seulement les LogRecords                                     |
| Compteur `recordSubagentExecutionMetrics`                                         | `metrics.ts:829`                                  | Garder — le consommateur de métriques est indépendant du pont de trace                                |

**Ignorer le pont** (le seul changement dans LogToSpanProcessor) :

```ts
// log-to-span-processor.ts — dans onEmit, après deriveSpanName
const skipBridge = new Set<string>([
  EVENT_SUBAGENT_EXECUTION, // couvert par le span natif qwen-code.subagent
]);
if (skipBridge.has(eventName)) return;
```

**Impact sur les consommateurs de traces** : les tableaux de bord qui filtrent sur le nom de span `qwen-code.subagent_execution` commenceront à retourner zéro résultat. Ils doivent être mis à jour vers `qwen-code.subagent`. À noter dans les notes de version.

**Pourquoi ne pas supprimer le LogRecord** : c'est l'entrée pour RUM et les métriques. Le supprimer serait une refactorisation sur 3 systèmes ; hors du périmètre ici.

**Pourquoi ne pas garder les deux** : la trace montrerait deux spans par sous-agent (`qwen-code.subagent` + `qwen-code.subagent_execution`) portant des informations redondantes — source de confusion pour les opérateurs lisant les traces, volume de spans dupliqué.

### D5 — Nom du span + attributs : conformité hybride à la spécification, préfixe fournisseur pour les extensions

**Nom du span** : `qwen-code.subagent` (correspond à la convention de codebase Phase 1/2 : `qwen-code.interaction`, `qwen-code.tool`, `qwen-code.hook`, …).

La spécification OTel GenAI dit que le nom de span canonique est `invoke_agent {gen_ai.agent.name}` — mais **dit aussi** « les systèmes/cadriciels GenAI individuels PEUVENT spécifier des formats de nom de span différents. » Nous utilisons notre propre nom et définissons `gen_ai.operation.name='invoke_agent'` afin que les outils conscients de la spécification identifient toujours le span. Les opérateurs lisant notre arbre de traces voient une nomenclature cohérente `qwen-code.*`.

**Type de span** : `INTERNAL` (invocation de sous-agent intra-processus, selon la spécification).

**Ensemble d'attributs** :

| Catégorie                                                        | Attribut                                         | Source                                                               | Notes                                                                                                                                                                                    |
| ---------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Requis par la spécification**                                  | `gen_ai.operation.name='invoke_agent'`           | littéral                                                             | requis par la spécification                                                                                                                                                              |
| **Requis par la spécification**                                  | `gen_ai.provider.name='qwen-code'`               | littéral                                                             | requis par la spécification ; ambigu pour les agents intra-processus (la spécification l'a écrit pour le fournisseur LLM). Le définir à `'qwen-code'` est l'interprétation la plus honnête |
| **Requis (double émission)**                                     | `gen_ai.agent.id` + `qwen-code.subagent.id`      | `agentContext.agentId`                                               | double émission jusqu'à ce que la spécification atteigne Stable ; supprimer la clé du fournisseur plus tard                                                                              |
| **Requis (double émission)**                                     | `gen_ai.agent.name` + `qwen-code.subagent.name`  | `agentConfig.subagentType` (ex. `Explore`, `code-reviewer`, `fork`) | même double émission                                                                                                                                                                      |
| **Recommandé par la spécification**                              | `gen_ai.conversation.id`                         | `config.getSessionId()`                                              | permet les requêtes inter-traces par session ; coexiste avec l'attribut de span `session.id` existant (défini globalement dans #4367) — les deux pointent vers le même UUID, supprimer un quand la spécification se stabilise |
| **Recommandé par la spécification**                              | `gen_ai.request.model`                           | modèle surchargé si présent                                          | uniquement lorsque le sous-agent surcharge le modèle parent                                                                                                                              |
| **Fournisseur**                                                  | `qwen-code.subagent.invocation_kind`             | `'foreground'` ❘ `'fork'` ❘ `'background'`                           | pilote la stratégie TTL + traceId                                                                                                                                                        |
| **Fournisseur**                                                  | `qwen-code.subagent.is_built_in`                 | bool                                                                 | filtre de tableau de bord                                                                                                                                                                |
| **Fournisseur**                                                  | `qwen-code.subagent.parent_agent_id`             | ALS parent `agentId`                                                 | pour les sous-agents imbriqués + lignée inter-traces                                                                                                                                     |
| **Fournisseur**                                                  | `qwen-code.subagent.depth`                       | profondeur parente + 1 (haut = 0)                                    | détecteur de bug de récursion                                                                                                                                                            |
| **Fournisseur**                                                  | `qwen-code.subagent.invoking_request_id`         | depuis `agentContext`                                                | corrélation au niveau de la requête                                                                                                                                                      |
| **Spécification de fin de span**                                 | `error.type` (en cas d'échec)                    | classe d'erreur                                                     | norme OTel                                                                                                                                                                              |
| **Spécification de fin de span**                                 | `exception.message` (en cas d'échec)             | `truncateSpanError(error.message)`                                   | norme OTel ; réutilise la troncature de la Phase 2                                                                                                                                     |
| **Fournisseur de fin de span**                                   | `qwen-code.subagent.status`                      | `'completed'` ❘ `'failed'` ❘ `'cancelled'` ❘ `'aborted'`             | plus fin que SpanStatus d'OTel (qui est OK / ERROR / UNSET)                                                                                                                            |
| **Fournisseur de fin de span**                                   | `qwen-code.subagent.terminate_reason`            | depuis `SubagentExecutionEvent.terminate_reason`                     | ex. `task_complete`, `max_iterations`, `user_abort`, `ttl_swept`                                                                                                                        |
| **Fournisseur de fin de span**                                   | `qwen-code.subagent.result_summary_present`      | bool                                                                 | « le sous-agent a-t-il produit une sortie » — limité                                                                                                                                     |
| **Optionnel (sensible)** protégé par `includeSensitiveSpanAttributes` | `gen_ai.input.messages`                          | historique de chat structuré                                          | réutilise la barrière de #4097                                                                                                                                                           |
| **Optionnel (sensible)**                                          | `gen_ai.output.messages`                         | réponses du modèle                                                     | même barrière                                                                                                                                                                            |
| **Optionnel (sensible)**                                          | `gen_ai.system_instructions`                     | prompt système                                                        | même barrière                                                                                                                                                                            |
| **Optionnel (sensible)**                                          | `gen_ai.tool.definitions`                        | schémas d'outils                                                      | même barrière                                                                                                                                                                            |
**Mapping SpanStatus** :

- `status === 'completed'` → `SpanStatus { code: OK }`
- `status === 'failed'` → `SpanStatus { code: ERROR, message: truncated(error.message) }`
- `status === 'cancelled'` ou `'aborted'` → `SpanStatus { code: UNSET }` (conforme à la convention de la Phase 2)

**Pourquoi une double émission sur `id` + `name`** : la spécification est en Development (un cran avant Experimental). `OTEL_SEMCONV_STABILITY_OPT_IN=gen_ai_latest_experimental` existe pour adhésion optionnelle. Les noms d'attributs de la spécification peuvent être renommés avant Stable. La double émission est le même motif que celui utilisé en Phase 2 pour `call_id` → `tool.call_id` ; supprimez la clé vendeur lorsque la spécification atteint Stable.

**Pourquoi `qwen-code.subagent.*` (et non `qwen.subagent.*`)** : toutes les clés existantes préfixées par un vendeur dans `constants.ts` utilisent `qwen-code.*` (`qwen-code.user_prompt`, `qwen-code.tool_call`, etc.). La cohérence interne prime sur la préférence de nommage OTel, puisque les opérateurs interrogent ARMS par préfixe.

**Cardinalité** : les attributs de span ne sont pas des étiquettes de métriques dans OTel ; les attributs clés UUID (`id`, `parent_agent_id`, `invoking_request_id`) sont sans danger au niveau de la span. Ne les promouvez pas en étiquettes de métriques plus tard.

**~10-15 attributs par span** (selon le type d'invocation, l'échec, l'imbrication). Même ordre que `qwen-code.tool`.

### D6 — Champ `AgentContext.depth` ajouté directement

`AgentContext` (`agent-context.ts:32`) **n'est pas exporté** — seuls les helpers (`getCurrentAgentId`, `runWithAgentContext`, `getRuntimeContentGenerator`, `runWithRuntimeContentGenerator`) le sont. Aucune rupture en aval au niveau TypeScript. Les 6 lecteurs connus via `getCurrentAgentId()` ne lisent que `agentId` ; l'ajout de `depth?: number` leur est invisible.

```ts
interface AgentContext {
  agentId: string;
  subagentName: string;
  invokingRequestId: string;
  invocationKind: 'spawn' | 'resume';
  isBuiltIn: boolean;
  depth?: number; // NOUVEAU — valeur par défaut 0 dans les lecteurs
}
```

`runWithAgentContext` utilise déjà le spread `{ ...current, agentId }`, donc `depth` survit inchangé dans les sites d'appel existants. **Mettez à jour `runWithAgentContext` pour auto-incrémenter depth en interne** — aucun appelant n'a besoin de connaître depth :

```ts
function runWithAgentContext<T>(agentId: string, fn: () => T): T {
  const parent = agentContextStorage.getStore();
  const next: AgentContext = {
    ...parent,
    agentId,
    depth: (parent?.depth ?? -1) + 1, // auto-incrémentation
  };
  return agentContextStorage.run(next, fn);
}
```

Sous-agent de premier niveau : pas de parent ALS → `depth: 0`. Imbriqué : profondeur du parent +1.

Un nouvel accesseur minuscule `getCurrentAgentDepth(): number` retourne `agentContextStorage.getStore()?.depth ?? 0` — utilisé par `startSubagentSpan` pour remplir `qwen-code.subagent.depth`.

**Pourquoi pas un ALS séparé juste pour la télémétrie** : cela dupliquerait la même forme de contexte que nous maintenons déjà. Mauvais. Réutilisez celui existant.

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
  invokerSpanContext?: SpanContext; // requis pour fork / background (source du Link)
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

`startSubagentSpan` se ramifie en interne selon `invocationKind` :

```ts
function startSubagentSpan(opts: StartSubagentSpanOptions): Span {
  const attributes = buildSpanAttributes(opts);
  const tracer = getTracer();

  if (opts.invocationKind === 'foreground') {
    // Enfant de la span active courante (span de l'outil appelant)
    return tracer.startSpan(SPAN_SUBAGENT, {
      kind: SpanKind.INTERNAL,
      attributes,
    });
  }

  // fork / background : racine liée (linked root)
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
    root: true, // force un nouveau traceId ; ignore le contexte actif comme parent
  });
}
```

## Câblage du cycle de vie

### Premier plan nommé (le chemin commun)

```ts
// agent.ts:~2154
// Récupérer le cadre ALS parent pour définir parentAgentId sur la span. La
// profondeur du nouvel enfant est calculée automatiquement dans
// runWithAgentContext (D6) — nous la lisons via getCurrentAgentDepth() une fois
// que nous sommes À L'INTÉRIEUR du cadre ALS enfant. Deux étapes :
const parentAgentId = getCurrentAgentId();  // AVANT d'entrer dans le cadre enfant

// ... l'appel runFramed existant entre dans runWithAgentContext(hookOpts.agentId, ...) ...

// À L'INTÉRIEUR de runFramed, nous pouvons lire la profondeur de l'enfant :
//   const depth = getCurrentAgentDepth();
//
// Placement pratique : transmettez `depth` comme variable de fermeture, définie
// après que runWithAgentContext prend effet — OU calculez-la comme
// `(getCurrentAgentDepth() outside) + 1` du côté appelant (plus simple).
const depth = getCurrentAgentDepth();  // en dehors du cadre ; l'enfant sera ceci + 1
// (définissez qwen-code.subagent.depth = depth dans les arguments de startSubagentSpan)

const span = startSubagentSpan({
  agentId, subagentName, invocationKind: 'foreground',
  isBuiltIn, parentAgentId, depth, invokingRequestId, sessionId,
  modelOverride,
  // invokerSpanContext omis — foreground hérite naturellement via context.with
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
// la span vit à travers les interactions suivantes de la session parente.
```

### Arrière-plan

Même forme que fork, avec `invocationKind: 'background'` et `bgEventEmitter` au lieu de `eventEmitter`. TTL de 4h (identique à fork — règle de type de D3).

## Isolation concurrente — la garantie phare

Trois invocations simultanées de sous-agent depuis une seule invite utilisateur (le modèle émet 3 blocs AGENT tool_use → `coreToolScheduler.runConcurrently` exécute 3 `executeSingleToolCall` en parallèle ; chacun ouvre sa propre span `qwen-code.tool` selon la Phase 2) :

```
qwen-code.interaction                         [traceId=T0]
├─ qwen-code.tool [agent call #A]
│  └─ qwen-code.subagent (A, foreground)     [traceId=T0, child]
│     ├─ qwen-code.llm_request
│     └─ qwen-code.tool [...]
│        └─ qwen-code.tool.execution
├─ qwen-code.tool [agent call #B]
│  └─ qwen-code.subagent (B, foreground)     [traceId=T0, child]
│     └─ qwen-code.llm_request
└─ qwen-code.tool [agent call #C]
   └─ qwen-code.subagent (C, fork)           [traceId=T1, linked root]
      └─ qwen-code.llm_request                [traceId=T1]
         └─ ...                               [traceId=T1, peut émettre des heures plus tard]
```

`context.with(span, runX)` pour chacun de A, B, C s'exécute en concurrence. `AsyncLocalStorageContextManager` (déjà enregistré automatiquement par NodeSDK à `sdk.ts:273`) délimite par fibre ; pas d'interférence. Les spans LLM / outil / hook enfants de chaque sous-agent voient `span` via `context.active()` dans leur propre chaîne asynchrone.

Le fork (C) forme une trace séparée — ses spans enfants héritent de `traceId=T1` même lorsqu'elles sont émises à travers plusieurs interactions suivantes de la session parente. Une requête ARMS par `session.id` renvoie à la fois T0 et T1; le Link depuis la racine de T1 vers la span `qwen-code.tool` invocatrice de C fournit une navigation explicite.

## Fichiers à modifier

| Fichier                                                        | Modification                                                                                                                                                                                     | Estimation LOC |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `packages/core/src/telemetry/constants.ts`                     | Ajouter `SPAN_SUBAGENT`, `SPAN_TTL_MS_LONG`, constantes de clés d'attributs                                                                                                                     | +8             |
| `packages/core/src/telemetry/session-tracing.ts`               | Ajouter `startSubagentSpan` (branche foreground/racine-liée), `endSubagentSpan`, `runInSubagentSpanContext`, types ; étendre l'union `SpanType` avec `'subagent'` ; étendre le balayage TTL avec `ttlFor(ctx)` | +120           |
| `packages/core/src/telemetry/log-to-span-processor.ts`         | Liste d'exclusion pour contourner le bridge de `qwen-code.subagent_execution`                                                                                                                    | +6             |
| `packages/core/src/telemetry/index.ts`                         | Ré-exporter les nouveaux helpers + types                                                                                                                                                         | +6             |
| `packages/core/src/agents/runtime/agent-context.ts`            | Ajouter `depth?: number` à `AgentContext` + accesseur `getCurrentAgentDepth()`                                                                                                                   | +12            |
| `packages/core/src/tools/agent/agent.ts`                       | Envelopper 3 chemins d'exécution (foreground/fork/background) dans `runInSubagentSpanContext` avec try/catch/finally                                                                             | +60            |
| `packages/core/src/telemetry/session-tracing.test.ts`          | Nouveau `describe('subagent spans')` : start/end, child vs linked-root, propagation de contexte, depth, TTL par type, fin idempotente, NOOP sous SDK non initialisé                               | +120           |
| `packages/core/src/telemetry/log-to-span-processor.test.ts`    | Vérifier que la liste d'exclusion court-circuite le bridge subagent_execution                                                                                                                    | +20            |
| `packages/core/src/tools/agent/agent.test.ts`                  | De bout en bout : 3 sous-agents concurrents obtiennent chacun un sous-arbre isolé ; les spans du fork héritent d'un nouveau traceId via Link ; cycle de vie en arrière-plan                      | +80            |

Total : 9 fichiers, ~430 LOC. Plus gros que les commits typiques de Phase 2 mais justifié — le changement TTL touche un fichier séparé, le skip LogToSpanProcessor est un fichier séparé, et les fichiers de test doublent. Diviser aboutirait à une surface de télémétrie incomplète.

Si la revue critique la taille : divisez en 2 PR — (A) helpers de télémétrie + tests, (B) câblage `agent.ts` + tests e2e. Les helpers atterris en premier ne changent pas le comportement à l'exécution.

## Stratégie de test

| Test                                                                               | Ce qu'il prouve                                                         |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `startSubagentSpan foreground parents to active OTel span`                        | Chemin enfant-span                                                      |
| `startSubagentSpan fork crée un nouveau traceId + Link vers invoker`               | Chemin racine-liée                                                      |
| `runInSubagentSpanContext propage le span à travers await / Promise.all`           | Primitive d'isolation                                                   |
| `3 spans de sous-agent concurrents ne partagent pas d'enfants`                     | Garantie de concurrence phare                                           |
| `sous-agent imbriqué enregistre depth + parentAgentId`                             | Métadonnées d'imbrication                                               |
| `endSubagentSpan mapping de statut (completed / failed / cancelled / aborted)`    | Taxonomie des statuts                                                   |
| `endSubagentSpan émet doublement gen_ai.agent.id + qwen-code.subagent.id`          | Double émission conforme à la spécification                             |
| `Cycle de vie fork : le span survit au retour de AgentTool.execute`               | Exactitude fire-and-forget                                              |
| `TTL : subagent fork reste au-delà de 30 min, est estampillé et terminé à 4h`      | TTL adapté au type                                                      |
| `TTL : subagent foreground à 30 min reçoit le balayage par défaut`                | TTL ne s'étend pas indûment                                             |
| `LogToSpanProcessor saute qwen-code.subagent_execution mais émet encore vers RUM` | Le skip du bridge fonctionne                                            |
| `runConcurrently de 3 appels d'outil agent produit 3 spans de sous-agent distinctes` | De bout en bout au niveau du planificateur                              |
| `sous-agent en échec définit exception.message + error.type + SpanStatus=ERROR`   | Chemin d'erreur standard OTel                                           |
| `Attributs optionnels verrouillés par includeSensitiveSpanAttributes`              | Réutilise correctement la barrière de #4097                             |
| `startSubagentSpan retourne NOOP_SPAN quand SDK non initialisé`                   | Correspond à la discipline NOOP des Phases 1/2 ; les appels avals restent sûrs |
| `fork span Link.context correspond au spanContext de la span outil invocatrice`   | La navigation inter-traces fonctionne de bout en bout                   |
| `runWithAgentContext auto-incrémente depth : parent=0, enfant=1, petit-enfant=2`  | La comptabilité de profondeur est correcte sans coopération de l'appelant |

## Cas limites

| Cas                                                                                                                              | Gestion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sous-agent à l'intérieur d'un outil à l'intérieur d'un sous-agent (depth > 1)                                                   | L'attribut `depth` suit ; recommander un `debugLogger.warn` logiciel à depth ≥ 5 (détecteur de récursion infinie)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Sous-agent engendré pendant `awaiting_approval` d'un outil parent                                                                | Le span du sous-agent est un enfant du span de l'outil AGENT ; le `tool.blocked_on_user` de l'outil AGENT est un frère, pas un parent — tous deux enfants du span de l'outil AGENT. L'arbre reste correct                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `signal.aborted` en plein milieu d'un sous-agent                                                                                 | Le callback de `runInSubagentSpanContext` lance ou résout ; `finally` définit `status='aborted'`, SpanStatus UNSET                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Fork encore actif quand la session parent se termine                                                                            | Le TTL de 4h se déclenche ; attributs sentinelles `qwen-code.span.ttl_expired:true`, `qwen-code.subagent.terminate_reason='ttl_swept'`, `status='aborted'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `endSubagentSpan` appelé deux fois                                                                                                | Idempotent — vérifie la map `activeSpans` ; le second appel ne fait rien (correspond au motif Phase 2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| L'appel LLM du sous-agent utilise un modèle différent du parent                                                                  | `gen_ai.request.model` défini sur le span du sous-agent ; la sous-span de requête LLM enregistre AUSSI le modèle — pas de conflit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Une exception de prélude d'un sous-agent frère s'échappe de `attemptExecutionOfScheduledCalls`                                   | Atterrit dans le catch récemment corrigé de Phase 2 dans `handleConfirmationResponse` qui est EN DEHORS du try — pas attribué au span de l'outil confirmé. Le span du sous-agent se ferme correctement via son propre try/finally                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Fork concurrent + foreground depuis un même parent                                                                               | Foreground hérite du traceId T0, fork obtient T1. Les deux ont une propagation de contexte correcte et indépendante. Le span de l'outil parent se termine quand son travail synchrone retourne ; le span fork (trace séparée) continue de vivre                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Le span fork commence dans le flux synchrone de l'appelant mais le corps s'exécute plus tard                                    | `startSubagentSpan` est appelé AVANT `void runInForkContext(...)` de sorte que le span (et son Link vers l'invocateur) est capturé alors que le spanContext de l'invocateur est encore lisible. La durée du span inclut donc tout délai de planification de la microtask avant que le corps ne démarre réellement — typiquement sous la ms ; si la production montre des écarts non négligeables, un attribut séparé `qwen-code.subagent.scheduling_delay_ms` peut être ajouté (question ouverte)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| SDK non initialisé (télémétrie désactivée)                                                                                      | `startSubagentSpan` retourne prématurément NOOP_SPAN (correspond à tous les autres helpers Phase 1/2). `runInSubagentSpanContext(NOOP_SPAN, fn)` appelle quand même `fn` normalement. `endSubagentSpan(NOOP_SPAN, …)` est un no-op                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Les spans de pont de logs du fork (`tool_call`, `api_request`, etc.) utilisent le traceId dérivé de la session tandis que les spans natives du fork utilisent T1 | Comportement préexistant — les spans de pont de logs utilisent toujours `deriveTraceId(sessionId)`, les spans natives utilisent le contexte OTel. La divergence est invisible à l'intérieur d'une trace mais signifie qu'une recherche ARMS par traceId sur T1 n'inclura pas les enfants de pont de logs du fork. Hors scope de cette PR ; signalé comme question ouverte #5                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Les parents des spans de hook `SubagentStart` diffèrent entre foreground et background                                          | Foreground déclenche `fireSubagentStartEvent` à l'intérieur de `runSubagentWithHooks` → déjà dans `runInSubagentSpanContext`, donc le span du hook se parente sous `qwen-code.subagent`. Background le déclenche AVANT le wrapping `runWithSubagentSpan` (donc le span du sous-agent n'existe pas encore), donc son span de hook se parente sous l'outil AGENT `qwen-code.tool`. Les opérateurs qui interrogent "spans de hook sous spans de sous-agent" doivent s'attendre à ce que `SubagentStart` du bg soit absent de cette vue. Déplacer le déclenchement du hook bg à l'intérieur de `framedBgBody` est mécaniquement simple (la mutation de `contextState` atteint `bgSubagent.execute` de toute façon), mais cela change la sémantique visible par l'utilisateur : aujourd'hui le hook se déclenche de manière synchrone avant que `AgentTool.execute` ne retourne le message "Agent en arrière-plan lancé", donc tout travail de configuration synchrone effectué par le hook se produit dans le tour bloquant l'utilisateur ; le déplacer fait que le hook se déclenche de manière détachée après le retour du message de lancement. Reporté en attendant une décision délibérée sur la sémantique préférée |
## Rollback

La modification est additive au niveau OTel — les tableaux de bord existants qui ne filtrent pas sur les noms de spans liés aux sous-agents continuent de fonctionner. Les consommateurs de traces qui regroupent par span parent verront de nouveaux nœuds `qwen-code.subagent` entre `qwen-code.tool` et `qwen-code.llm_request` ; à documenter dans les notes de version.

Le changement comportemental est le saut du LogToSpanProcessor — les tableaux de bord qui consommaient auparavant la span `qwen-code.subagent_execution` renvoient zéro. Atténuation : conserver le LogRecord intact (RUM + métriques le voient encore) ; seul le pont de span est supprimé. Les requêtes existantes basées sur les logs ne sont pas affectées.

Chemin de rollback : annuler la seule PR. Les nouvelles helpers de span ne sont invoquées que depuis `agent.ts` ; supprimer le câblage + le saut du LogToSpanProcessor restaure le comportement antérieur à l'identique.

## Implications d'échantillonnage

| Invocation                                       | Source de la décision d'échantillonnage                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `foreground` (span enfant, même traceId)         | Hérite de la décision d'échantillonnage de la trace parent via l'échantillonneur basé sur le parent |
| `fork` / `background` (racine liée, nouvelle traceId) | Décision d'échantillonnage indépendante à la création de la racine                            |

Pour la valeur par défaut actuelle de qwen-code (selon `tracer.ts:shouldForceSampled()` — parentbased + always_on sinon always_on), chaque span est échantillonnée, donc la divergence n'a pas d'impact. Pour les déploiements utilisant des échantillonneurs probabilistes (par ex. `traceidratio=0.1`), cela signifie :

- Une invite utilisateur peut être échantillonnée (T0 entièrement capturée) mais sa fork (T1) peut être abandonnée, ou l'inverse.
- Les opérateurs lisant le parent T0 voient "Lien : sous-agent C (T1)" — cliquer dessus peut renvoyer une 404 si T1 n'a pas été échantillonnée.

Atténuation : documenter pour les opérateurs. Si la capture complète du sous-agent est importante, forcer l'échantillonnage pour les fork/background via un futur bouton de configuration. Hors périmètre ici.

## Attributs sensibles (intégration #4097)

Réutiliser la porte existante `includeSensitiveSpanAttributes`. Quand elle est vraie, définir sur la span du sous-agent aux points d'accrochage du cycle de vie où les données sont disponibles :

| Attribut spec                | Source                                                       | Quand est défini                                                                                          |
| ---------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `gen_ai.system_instructions` | invite système rendue depuis `agentConfig` / contexte parent | `startSubagentSpan` (si disponible avant l'ouverture de la span) ou via `setAttributes` tôt dans le corps |
| `gen_ai.tool.definitions`    | déclarations d'outils disponibles pour le sous-agent         | idem ci-dessus                                                                                            |
| `gen_ai.input.messages`      | entrée initiale passée au sous-agent (invite + extraHistory) | au début du corps                                                                                         |
| `gen_ai.output.messages`     | messages de réponse finaux renvoyés par le sous-agent        | dans les métadonnées `endSubagentSpan`                                                                    |

Tout cela est déjà protégé par la porte ; le modèle de #4097 est d'appeler la helper `addSubagentSensitiveAttributes(span, opts)` depuis l'intérieur du corps. Détail d'implémentation — la conception note simplement le point d'intégration.

## Ordonnancement

- Indépendant de #4367 (attributs de ressource — en relecture). Pas de contrainte d'ordre de fusion, mais `gen_ai.conversation.id` sur les spans de sous-agent bénéficie du déplacement de `session.id` hors ressource de #4367. **Recommandation : merger d'abord #4367** pour que la source de vérité `getSessionId()` soit stable.
- Indépendant de la phase 4 (décomposition de requête LLM / TTFT). La phase 4 s'attache aux spans `qwen-code.llm_request` qu'elles soient sous un sous-agent ou une interaction. Recommandation : phase 3 avant phase 4 pour que les métriques par tentative de la phase 4 puissent être agrégées par sous-agent.

## Questions ouvertes

1. **`gen_ai.provider.name`** : la spec l'exige mais écrit la description pour le fournisseur LLM, pas pour le framework agent. Mettre `'qwen-code'` est la meilleure interprétation ; si une révision future de la spec ajoute une variante `agent.provider.name`, nous devrions changer.
2. **Nom de span `qwen-code.subagent` vs spec `invoke_agent {name}`** : cohérence interne choisie. Si l'adoption d'outils GenAI-aware croît et que `invoke_agent ${name}` devient critique pour l'auto-découverte, nous pouvons changer — le nom de span est l'élément le plus rebrandable d'OTel.
3. **Avertissement soft à profondeur ≥ 5** : nombre arbitraire. Pourrait être un bouton de configuration. Reporter jusqu'à ce que les données de production montrent un besoin.
4. **`SubagentExecutionEvent.result` contient toute la sortie LLM, qui est volumineuse** : aujourd'hui cela gonfle le volume des LogRecords. Le plan de migration (LogRecord → événements de span) est reporté mais mérite d'être fait une fois que l'agrégation de tokens-usage atterrit dans la phase 4.
5. **Les spans de pont de log à l'intérieur d'une fork aboutissent sur le traceId dérivé de la session, pas sur le T1 de la fork** : voir les cas particuliers. La correction est le problème plus large "la span d'interaction n'hérite pas du contexte racine de la session" soulevé dans le thread sessionId-vs-traceId — une conception séparée qui affecte toutes les spans natives, pas seulement le sous-agent. Hors périmètre.