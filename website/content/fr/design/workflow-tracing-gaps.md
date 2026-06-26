# Analyse du manque de granularité des spans au niveau du workflow (P1)

> Basé sur la revue de qwen-code origin/main du 2026-05-13

## État actuel

qwen-code dispose déjà d'une infrastructure de tracing :

| Composant           | Emplacement                                        | Description                                                                 |
| ------------------- | -------------------------------------------------- | --------------------------------------------------------------------------- |
| Définition des spans| `packages/core/src/telemetry/session-tracing.ts`   | `interaction`, `llm_request`, `tool`, `tool.execution`                      |
| Outils Tracer       | `packages/core/src/telemetry/tracer.ts`            | session root context, `withSpan`, `startSpanWithContext`                    |
| Point d'entrée des interactions | `packages/core/src/core/client.ts`       | L'interaction de haut niveau démarre explicitement un span `interaction`    |
| Gestion du cycle de vie | —                                               | AsyncLocalStorage + WeakRef + nettoyage TTL                                 |

Actuellement, seuls deux types de spans génériques sont stablement intégrés dans le runtime :

- `api.generateContent` / `api.generateContentStream`
- `tool.<toolName>`

**Conclusion : nous sommes à l'étape "tronc de tracing existant", mais les limites des phases du workflow agent ne sont pas encore encodées dans l'arbre de trace.**

### Comparaison : types de spans déjà implémentés par claude-code

Référence : `claude-code/src/utils/telemetry/sessionTracing.ts` (ligne 49) :

- `interaction`
- `llm_request`
- `tool`
- `tool.blocked_on_user`
- `tool.execution`
- `hook`

## Éléments manquants

| Span / mécanisme manquant                      | Impact                                                                 |
| ---------------------------------------------- | ---------------------------------------------------------------------- |
| Span `permission_wait` / `blocked_on_user`     | Impossible de distinguer le temps d'attente d'approbation vs temps d'exécution de l'outil |
| Span `hook`                                    | Le temps des hooks est absorbé dans le span tool, limite floue         |
| Span racine `subagent`                         | Les appels llm/tool internes au subagent ne forment pas de sous-arbre de trace |
| Câblage réel de `tool.execution`               | Le helper est défini mais n'est pas appelé dans la chaîne principale   |
| Wiring parent-enfant stable                    | Les spans sont surtout des frères sous la racine de session plutôt qu'un arbre hiérarchique |

## Analyse détaillée

### 1. L'attente d'approbation utilisateur n'est pas dans la trace

Lorsqu'un appel d'outil attend l'approbation, le chemin de transition d'état est `awaiting_approval` → `scheduled` → exécution.

- "Attente de confirmation utilisateur" n'est qu'une transition d'état, pas un nœud de trace
- Le temps d'attente d'approbation n'est pas visible dans la trace
- En cas de lenteur d'un outil, impossible de savoir si c'est "bloqué sur l'utilisateur" ou "exécution lente de l'outil"

### 2. Les hooks ont des enregistrements d'événements mais pas de span indépendant

L'exécution des hooks pre/post produit un `HookCallEvent`, via `logHookCall()`, mais ne crée pas de span OTel indépendant.

- Quand un hook ralentit, cela se manifeste par un ralentissement du span tool englobant
- En cas d'échec d'un hook, cela apparaît comme "échec de l'outil"
- La trace ne permet pas de répondre "le temps est-il passé dans le hook ou dans tool.execution ?"

### 3. Les subagents sont des logs/métriques, pas une sous-arborescence de trace

Le démarrage/arrêt d'un subagent enregistre un `SubagentExecutionEvent` et va dans les logs/métriques, mais ne forme pas un sous-arbre de span explicite.

- On peut compter "quel subagent a été exécuté"
- On ne peut pas suivre dans la trace "quels appels llm/tool ce subagent a déclenchés"
- En cas de subagents concurrents, la chaîne causale est floue

### 4. Le helper tool.execution est défini mais pas raccordé à la chaîne principale

`session-tracing.ts` contient déjà `startToolExecutionSpan()` / `endToolExecutionSpan()`, mais aucun appel n'est visible dans le code non-test.

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

### 5. Le wiring parent-enfant n'est pas assez stable

Le span interaction existe déjà, mais de nombreux spans en cours d'exécution sont rattachés sous la racine de session en tant que frères, plutôt que comme enfants du span interaction.

- L'arbre d'appels est plat
- Les relations de cause à effet entre nœuds ne sont pas intuitives
- L'expérience de suivi depuis un tour utilisateur jusqu'aux appels llm/tool/hook/subagent internes n'est pas fluide

## Impact

- Les traces ont une valeur de base, mais insuffisante pour le diagnostic au niveau workflow
- Impossible de répondre directement "cette étape est lente à cause de l'attente utilisateur, d'un hook, ou de l'exécution réelle de l'outil"
- Impossible de reconstituer le déroulement d'un subagent comme un sous-arbre de trace lisible
- Les problèmes de hooks sont absorbés dans le span tool, limite floue
- Dans Jaeger / Tempo / ARMS, l'arbre est plus plat et plus difficile à lire que celui de claude-code

---

## Analyse de réutilisation de la solution claude-code

> Basé sur une comparaison approfondie du code source de claude-code du 2026-05-13

### Architecture de tracing de claude-code

claude-code implémente dans `src/utils/telemetry/sessionTracing.ts` un **système de gestion de spans unifié basé sur deux ALS** :

```
                    interactionContext (ALS)          toolContext (ALS)
                          │                                │
                          ▼                                ▼
              ┌─────────────────────┐           ┌─────────────────────┐
              │  interaction span   │           │    tool span        │
              │  (session root)     │           │  (child of intxn)   │
              └─────────────────────┘           └─────────────────────┘
                   ▲ parent of                       ▲ parent of
                   │                                 │
           ┌───────┴───────┐              ┌──────────┼──────────┐
           │               │              │          │          │
      llm_request      tool          blocked    execution    hook
                                     _on_user
```

**Mécanismes clés :**

| Mécanisme     | Implémentation                                                                                                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Double ALS    | `interactionContext` stocke le span interaction courant ; `toolContext` stocke le span tool courant                                                                                          |
| Résolution parent | Chaque type de span a un ALS source codé en dur pour trouver son parent : `llm_request`/`tool` prennent `interactionContext` ; `blocked_on_user`/`execution`/`hook` prennent `toolContext` ; `hook` a un fallback vers `interactionContext` |
| Cycle de vie  | enterWith injecte → span s'exécute → enterWith(undefined) efface                                                                                                                             |
| Recherche de span | Les spans non stockés dans ALS (ex. blocked_on_user) sont retrouvés via une Map `activeSpans` par `span.type`                                                                               |
| Gestion mémoire | Les spans détenus par ALS utilisent WeakRef ; les spans hors ALS utilisent strongRef pour éviter le GC ; nettoyage automatique TTL 30 min                                                    |

**Cycle de vie complet d'un span tool chez claude-code** (`toolExecution.ts`):

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

**Span hook chez claude-code** (`hooks.ts`):

```
startHookSpan(event, name, count, defs)       // → parent = toolContext ?? interactionContext
  [exécution parallèle des hooks]
endHookSpan(span, { success, blocking, ... })
```

### Architecture existante de qwen-code vs claude-code

#### Différence fondamentale : deux chemins de création de spans disjoints

C'est le problème d'architecture le plus critique de qwen-code actuellement :

| Couche               | Fichier                | Utilisation                                                                                     | Résolution parent                                            |
| -------------------- | ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Couche session-tracing | `session-tracing.ts` | `startInteractionSpan` / `startLLMRequestSpan` / `startToolSpan` / `startToolExecutionSpan`     | Récupère explicitement le parent depuis l'ALS `interactionContext` |
| Couche tracer        | `tracer.ts`            | `withSpan` / `startSpanWithContext`                                                             | Prend le parent de `context.active()`, fallback vers session root |

**Situation réelle des appels dans le runtime :**

- `startInteractionSpan` → **déjà raccordé** (`client.ts` ligne 956), écrit dans l'ALS `interactionContext`
- `startLLMRequestSpan` / `endLLMRequestSpan` → **non raccordé**, le runtime utilise `withSpan('api.generateContent', ...)` (dans `loggingContentGenerator.ts`)
- `startToolSpan` / `endToolSpan` → **non raccordé**, le runtime utilise `withSpan('tool.${name}', ...)` (dans `coreToolScheduler.ts`)
- `startToolExecutionSpan` / `endToolExecutionSpan` → **non raccordé**

**Conséquence :**

`getParentContext()` de `withSpan` vérifie d'abord `context.active()` (contexte OTel natif), et s'il n'y a pas de span actif, retombe sur le contexte racine de session. Il **ne lit pas du tout** l'ALS `interactionContext`.

Par conséquent, le span interaction et les spans LLM/tool deviennent des **frères de même niveau** sous la racine de session, plutôt qu'un arbre parent-enfant :

```
session-root
  ├── interaction         (depuis session-tracing, écrit dans l'ALS interactionContext)
  ├── api.generateContent (depuis withSpan, ne lit pas interactionContext → attaché à session root)
  ├── tool.Bash           (depuis withSpan, idem)
  └── tool.Read           (depuis withSpan, idem)
```

**Alors que chez claude-code, il n'y a qu'un seul chemin de création de spans (sessionTracing.ts), tous les spans passent par la même logique de conversion ALS → contexte OTel, donc l'arbre est complet.**

#### Évaluation de réutilisation par élément

##### 1. Double ALS + résolution explicite du parent — Réutilisable, c'est la correction centrale

| Dimension       | claude-code                                        | qwen-code                                  |
| --------------- | -------------------------------------------------- | ------------------------------------------ |
| Nombre d'ALS    | 2 (`interactionContext` + `toolContext`)           | 1 (`interactionContext`, pas de `toolContext`) |
| Résolution parent | Chaque type de span spécifie explicitement de quel ALS prendre le parent | `withSpan` passe systématiquement par `context.active()` |
| Injection contexte | `trace.setSpan(otelContext.active(), parentCtx.span)` | `withSpan` utilise `startActiveSpan` en interne (implicite) |

**Plan de réutilisation :**

Le `session-tracing.ts` de qwen-code implémente déjà un **modèle de résolution parent presque identique** à celui de claude-code :

```typescript
// qwen-code session-tracing.ts (existe mais inutilisé)
export function startLLMRequestSpan(model, promptId): Span {
  const parentCtx = interactionContext.getStore();
  const ctx = parentCtx
    ? trace.setSpan(otelContext.active(), parentCtx.span)
    : otelContext.active();
  // ...
}
```

Cette logique est **parfaitement cohérente** avec `startLLMRequestSpan` de claude-code.

**Chemin de correction central : abandonner les appels `withSpan('api.*')` / `withSpan('tool.*')` dans le runtime et les remplacer par les helpers typés de session-tracing.** Pas besoin de réécrire la couche session-tracing — son API est déjà prête.

Seuls besoins supplémentaires :

- Ajouter un ALS `toolContext` (en imitant claude-code)
- Ajouter les types de span `blocked_on_user` et `hook` ainsi que leurs fonctions helper

##### 2. tool.blocked_on_user — Nécessite une adaptation au flux d'approbation

| Dimension       | claude-code                                          | qwen-code                                                                              |
| --------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Emplacement de l'approbation | Dans `toolExecution.ts`, à l'intérieur du span tool   | Dans `coreToolScheduler._schedule()`, avant le span tool                               |
| Mode d'approbation | Attente synchrone de `resolveHookPermissionDecision()` | Piloté par machine d'état : `validating` → `awaiting_approval` → `scheduled` → `executing` |
| Couverture du span | Le span tool inclut blocked + execution               | Le span tool (`withSpan`) ne couvre que l'exécution (à partir de `executeSingleToolCall`) |

**Différence clé :** Le point d'entrée `executeSingleToolCall` de qwen-code vérifie que `toolCall.status !== 'scheduled'` pour continuer — donc quand on y arrive, l'approbation est déjà terminée. Le `withSpan` du span tool n'englobe pas le temps d'attente d'approbation.

**Plan d'adaptation (deux options) :**

**Option A — Déplacer le début du span tool (recommandé) :**

Déplacer l'appel `startToolSpan` de `executeSingleToolCall` vers `_schedule`, avant la vérification d'approbation, pour que le span tool couvre le cycle de vie complet. Appeler `startToolBlockedOnUserSpan` lors de l'entrée dans l'état `awaiting_approval`, et `endToolBlockedOnUserSpan` à la fin de l'approbation (état `scheduled`).

```
_schedule():
  startToolSpan(name)                         // ← nouveau
    startToolBlockedOnUserSpan()              // ← nouveau, à l'entrée de awaiting_approval
      [attente de la machine d'état]
    endToolBlockedOnUserSpan(decision)        // ← nouveau, à l'entrée de scheduled
executeSingleToolCall():
    startToolExecutionSpan()                  // ← raccorder le helper existant
      [hook + execute]
    endToolExecutionSpan()
  endToolSpan()                               // ← doit être dans un finally
```

**Option B — Garder la position actuelle du span tool, tracer l'approbation séparément :**

Créer un span `approval_wait` indépendant dans `_schedule` (pas en tant qu'enfant de tool), rattaché à interaction. Avantage : moins de modifications. Inconvénient : incohérence avec le modèle de claude-code, arbre de trace moins lisible.

**Il est recommandé d'adopter l'option A**, car :

- Structure d'arbre de trace cohérente avec claude-code
- Un seul nœud tool dans la trace permet de voir "temps d'attente + temps d'exécution"
- La nature pilotée par machine d'état n'affecte que le déclenchement des début/fin de span, pas la modélisation parent-enfant

##### 3. Hook span — directement réutilisable

| Dimension         | claude-code                           | qwen-code                                                        |
| ----------------- | ------------------------------------- | ---------------------------------------------------------------- |
| Point d'entrée hook | `executeHooks()` dans `hooks.ts`      | `firePreToolUseHook`/`firePostToolUseHook` via `hookEventHandler.ts` |
| Mode d'enregistrement actuel | Span OTel + span Perfetto            | `HookCallEvent` → `QwenLogger` (pas d'OTel)                      |
| Parent            | `toolContext ?? interactionContext`   | —                                                                |

**Plan de réutilisation :**

1. Ajouter `startHookSpan` / `endHookSpan` dans `session-tracing.ts` (parent = `toolContext ?? interactionContext`, identique à claude-code)
2. Dans `coreToolScheduler.ts` de `executeSingleToolCall`, appeler start/end hook span avant/après les hooks pre/post
3. Conserver l'enregistrement existant des événements `logHookCall` (les deux en parallèle, non exclusifs)

Faible volume de modifications, sans impact sur la logique existante des hooks.

##### 4. tool.execution — helper existant, il suffit de le raccorder

`startToolExecutionSpan(parentToolSpan)` / `endToolExecutionSpan(span, metadata)` sont déjà entièrement implémentés dans qwen-code, il suffit de les appeler dans `executeSingleToolCall` :

```typescript
// coreToolScheduler.ts à l'intérieur de executeSingleToolCall
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

Note : `startToolExecutionSpan` de qwen-code prend un paramètre explicite `parentToolSpan`, alors que chez claude-code il est récupéré implicitement depuis l'ALS `toolContext`. Cela n'affecte pas la fonctionnalité, c'est juste une différence de style. Si l'ALS `toolContext` est introduit, on pourrait unifier en récupération implicite.

##### 5. Arbre de trace subagent — les deux côtés sont incomplets, déconseillé de réutiliser directement

| Dimension          | claude-code                                                             | qwen-code                                            |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------- |
| Propagation trace OTel | **Aucune** — l'interaction du subagent est une nouvelle racine          | **Aucune** — pas de propagation explicite de trace pour subagent |
| Association d'identité | Métadonnées Perfetto (process/thread agent) + ALS `teammateContextStorage` | ALS `subagentNameContext` + `SubagentExecutionEvent` |
| Isolation concurrente | Risque de fuite ALS OTel (`enterWith` est au niveau processus, les subagents concurrents s'écrasent mutuellement) | Même risque                                        |

claude-code **n'a pas non plus résolu** le tracing OTel des subagents :

- `interactionContext.enterWith()` est au niveau processus, des subagents concurrents écrasent les valeurs ALS les uns des autres
- Le véritable arbre hiérarchique agent n'existe que dans Perfetto (système interne à Anthropic, feature-flag), pas dans OTel

**Recommandations :**

- Court terme : conserver le schéma existant de qwen-code (`subagentNameContext` + logs d'événements)
- Moyen terme : créer un span `subagent` au démarrage du subagent (parent = toolContext actuel) et utiliser `context.with()` plutôt que `enterWith()` pour isoler le contexte OTel des subagents concurrents
- C'est un élément de travail nécessitant une conception indépendante, il est déconseillé de copier directement claude-code

##### 6. LLM request span — Chemin clair

qwen-code utilise actuellement `withSpan('api.generateContent', ...)` et `startSpanWithContext('api.generateContentStream', ...)` dans `loggingContentGenerator.ts`.

Il suffit de les remplacer par des appels à `startLLMRequestSpan` / `endLLMRequestSpan` (déjà implémentés dans la couche session-tracing). Attention pour le cas streaming :

- `startLLMRequestSpan` retourne un objet `Span`
- Il faut appeler manuellement `endLLMRequestSpan(span, metadata)` pour terminer
- Cela est compatible avec le mode de gestion manuelle de `startSpanWithContext`

### Résumé de la réutilisation

| Élément à modifier                                                         | Degré de réutilisabilité                    | Volume de modifs                     | Priorité |
| -------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------ | -------- |
| Unifier le chemin de création des spans (abandonner `withSpan` runtime, utiliser les helpers session-tracing) | **Correction centrale** — résout la rupture parent-enfant | Moyen (~5 points d'appel)            | P0       |
| Ajouter l'ALS `toolContext`                                                | Copie directe du modèle claude-code        | Faible (dans session-tracing.ts)     | P0       |
| Span tool.blocked_on_user                                                  | Option A nécessite une adaptation à la machine d'état | Moyen (coordination \_schedule + executeSingleToolCall) | P1       |
| Raccordement de tool.execution                                             | Helper existant, juste appel                | Faible (3 lignes dans executeSingleToolCall) | P1       |
| Span hook                                                                  | Nouveau helper + point d'appel             | Faible                               | P1       |
| Remplacement du span LLM request                                           | Remplacer withSpan par helper typé         | Faible (2 points d'appel)            | P1       |
| Arbre de trace subagent                                                    | **Déconseillé de réutiliser directement** — conception indépendante nécessaire | Élevé | P2       |

### Ordre d'implémentation recommandé

```
Phase 1 — Réparer la structure de l'arbre de trace (P0)
├── 1a. Ajouter l'ALS toolContext + helpers de span blocked_on_user / hook dans session-tracing.ts
├── 1b. loggingContentGenerator.ts : withSpan → startLLMRequestSpan/endLLMRequestSpan
└── 1c. coreToolScheduler.ts : withSpan → startToolSpan/endToolSpan

Phase 2 — Compléter les spans de workflow (P1)
├── 2a. coreToolScheduler._schedule : raccorder le span blocked_on_user
├── 2b. coreToolScheduler.executeSingleToolCall : raccorder le span tool.execution
└── 2c. Aux endroits d'appel des hooks pre/post : raccorder le span hook

Phase 3 — Arbre de trace subagent (P2)
├── 3a. Concevoir une solution d'isolation avec context.with() (remplacer enterWith)
├── 3b. Créer un span racine subagent au démarrage du subagent
└── 3c. Valider le scénario de subagents concurrents
```