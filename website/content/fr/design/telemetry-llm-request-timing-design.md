# Conception de la décomposition temporelle des requêtes LLM (P3 Phase 4)

> [!note] Issue #3731 — Phase 4 du tracing hiérarchique de session. Ajoute le temps jusqu'au premier token, la durée de configuration de la requête, la durée d'échantillonnage et la télémétrie par tentative de relance au span `qwen-code.llm_request`, afin que les opérateurs puissent répondre à la question « pourquoi cet appel LLM est-il lent ? » sans deviner.
>
> S'appuie sur la Phase 1 (#4126), la Phase 1.5 (#4302), la Phase 2 (#4321). Indépendant de la Phase 3 (#4410, en révision) — il est recommandé d'intégrer d'abord la Phase 3 pour que les champs par tentative de la Phase 4 s'agrègent proprement dans les sous-arbres des sous-agents.

## Problème

Les spans `qwen-code.llm_request` actuels ne portent que `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Les opérateurs lisant une trace unique ne peuvent pas dire :

1. **Quelle part de `duration_ms` correspond au temps de réflexion du modèle vs la configuration réseau.** Une `duration_ms` de 12 secondes peut correspondre à 11 s de relances suivies d'1 s de génération rapide, ou à 100 ms de configuration suivies de 12 s de streaming lent — la trace ne le dit pas.
2. **Quand l'utilisateur a vu le premier token.** Le TTFT (temps jusqu'au premier token) est le SLO de latence standard pour les interfaces de chat. Nous ne pouvons pas le calculer ; nous ne le capturons pas.
3. **Ce qui s'est passé lors des relances.** `retryWithBackoff` (`utils/retry.ts:285`) appelle seulement `debugLogger.warn` — aucun événement OTel, aucun attribut de span. Les 4 sites d'appel LLM qui l'utilisent (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) n'ont aucune visibilité sur les relances dans les traces ou les métriques. `ContentRetryEvent` existe pour les relances de récupération de contenu dans `geminiChat.ts:806,830`, mais pas pour les relances plus courantes liées aux limites de débit / erreurs 5xx.
4. **Que `api.request.breakdown` est du code mort.** La métrique est définie dans `metrics.ts:242-251` avec 4 valeurs `ApiRequestPhase`, exportée depuis `index.ts:117`, testée dans `metrics.test.ts:646-675` — mais `recordApiRequestBreakdown()` n'a aucun appelant dans le code de production. L'infrastructure de métrique est payée ; le flux de données n'a jamais été connecté.

Ces lacunes font de `qwen-code.llm_request` le span le moins informatif de l'arbre de trace. Les spans d'outil (#4126/#4321) et les spans de sous-agent (#4410) exposent tous deux les phases du cycle de vie ; les spans LLM réduisent la requête entière à une seule durée opaque.

## Surface existante (inchangée)

| Composant                                                    | Emplacement                                                         | Raison pour laquelle nous ne modifions pas                                                                                                                                                                                    |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cycle de vie du span de requête LLM                          | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan`    | La Phase 1 (#4126) a établi les helpers. Nous étendons l'interface de métadonnées, ne restructurons pas                                                                                                                       |
| Propagation du span actif dans les générateurs de fournisseur | `loggingContentGenerator.ts:213,287`                                | La Phase 1 (#4126) a remplacé `withSpan('api.*')` par des helpers natifs ; le contexte actif atteint déjà le wrapper de flux                                                                                                  |
| Schéma et consommateurs de `ContentRetryEvent`               | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`              | L'événement existant conserve sa forme et ses consommateurs en aval ; nous ajoutons une classe d'événement sœur pour le chemin `retryWithBackoff`                                                                             |
| Logs de pont `LogToSpanProcessor` spans                      | `log-to-span-processor.ts`                                          | Le pont existant de ContentRetryEvent continue de se nicher sous le span LLM actif. La Phase 4 ne change pas cela                                                                                                             |
| Énumération `ApiRequestPhase`                                | `metrics.ts:330-334`                                                | Surface publique (4 valeurs). Nous peuplons 3 des 4 depuis le code de production ; laissons l'énumération inchangée pour la rétrocompatibilité                                                                                |
| Normalisation des chunks par fournisseur → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                          | Chaque fournisseur normalise déjà vers la forme `GenerateContentResponse` de Google avant que LoggingContentGenerator ne voie le flux. La détection du TTFT s'exécute centralement sur cette forme normalisée ; pas de code par fournisseur |
| `retryWithBackoff` relance à usage général                   | `utils/retry.ts:140`                                                | Utilisé à la fois par les appelants LLM et non LLM (`channels/weixin/src/api.ts`). Nous étendons avec un callback facultatif `onRetry` plutôt que de coupler durement avec la télémétrie LLM                                   |
| `generateContent` non streamé                                | `loggingContentGenerator.ts:212`                                    | Le TTFT n'est pas significatif pour le non streamé ; les nouveaux champs restent `undefined`. Le cycle de vie du span et les attributs existants inchangés                                                                     |
## Hors du périmètre (reporté)

- **Réessais au niveau du SDK** (openai SDK `maxRetries=3`, réessais internes du google-genai SDK). Tout se passe entièrement à l'intérieur du SDK tiers ; les observer nécessite de désactiver les réessais du SDK et de les réimplémenter dans `retryWithBackoff`. Décision distincte, pas la Phase 4.
- **Métriques de streaming par token** (latence inter-token, taille par bloc). Utiles pour le débogage des performances du moteur d'inférence, pas pour les questions de latence perçue par l'utilisateur que cible la Phase 4.
- **TTFT séparé pour les blocs de raisonnement/réflexion.** Le « premier token » inclut le contenu de réflexion (voir D1). Une amélioration future pourrait diviser `ttft_to_reasoning_ms` vs `ttft_to_answer_ms`, mais seulement après avoir constaté une demande.
- **Phase d'échantillonnage en tant que span enfant dédié.** Calculable à partir de `duration_ms - ttft_ms - request_setup_ms` ; un span enfant n'apporte rien pour les backends uniquement OTel (claude-code en utilise un pour Perfetto uniquement). Stocké comme attribut de span à la place — voir D6.
- **Limitation du débit au niveau des événements du mode de réessai persistant (`QWEN_CODE_UNATTENDED_RETRY`).** Une seule requête LLM peut produire plus de 50 enregistrements `ContentRetryEvent` / `ApiRetryEvent` en mode de réessai persistant. La limitation de l'émission est un suivi — la Phase 4 émet tous les événements ; si les volumes de production s'avèrent insoutenables, ajoutez un plafond d'émission par span avec un événement récapitulatif "+N tentatives supplémentaires (tronqué)" dans un PR ultérieur.
- **Phase de décomposition `TOKEN_PROCESSING`.** La valeur de l'énumération existe mais qwen-code n'a pas de véritable traitement local post-stream qui mérite d'être mesuré (<10 ms typique). Ignorée dans les appelants de production ; la valeur de l'énumération est conservée pour une utilisation future ou pour des appelants que nous ne contrôlons pas.
- **Migration de `ContentRetryEvent` vers le span LLM en tant qu'événements de span.** Même raisonnement que pour le LogRecord `subagent_execution` de la Phase 3 : les consommateurs existants (qwen-logger RUM, métriques futures) sont fortement couplés au LogRecord. La couverture du span de pont est suffisante.

## Références (preuves de décision)

| Source                                                                                                                      | Point clé                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------- | -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------                                                               |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFT capturé via `Date.now() - start` sur l'événement SSE `message_start` ; `start` réinitialisé par tentative de réessai. `requestSetupMs = start - startIncludingRetries`. Le tableau `attemptStartTimes` est conservé par tentative. Confirme la faisabilité de l'approche ; leur sémantique TTFT est « premier événement de flux » (nous divergons vers « premier contenu » — voir D1) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | Affiche Configuration de la requête → Tentative N (réessai) → Premier token → Échantillonnage sous forme de paires B/E imbriquées. Démontre la décomposition visuelle ; qwen-code effectue la même décomposition avec des attributs OTel puisque nous n'avons pas Perfetto                                                                                           |
| claude-code `sessionTracing.ts:447`                                                                                         | Seul `ttft_ms` parvient au span OTel (pas `requestSetupMs`, pas `samplingMs`, pas les chronométrages par tentative). Nous mettons délibérément plus d'informations sur le span — claude-code dispose de Perfetto pour la visualisation ; pas nous                                                                                                               |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                                                 | Aucune mesure TTFT. Un seul span Effet `LLM.run` couvre tout. Valide que l'écart existe entre les outils concurrents ; pas une référence pour savoir quoi faire                                                                                                                                                                   |
| [Conventions sémantiques OTel GenAI](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (statut : Développement / Expérimental) | `gen_ai.usage.input_tokens` (Stable), `gen_ai.usage.output_tokens` (Stable), `gen_ai.usage.cached_tokens` (Expérimental), `gen_ai.request.model` (Stable), `gen_ai.server.time_to_first_token` (Expérimental, secondes en double). Le motif de double émission suit le précédent #4410                                                             |
| [Spécification OTel Trace — Événements de span](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)             | « Les événements NE DEVRAIENT PAS être utilisés pour enregistrer des informations mieux capturées en tant qu'attributs de span. » Confirme que les informations par tentative doivent figurer sur les attributs du span LLM + les spans de pont de journalisation, pas en tant qu'événements de span sur le parent.                                                       |
| Document de conception Phase 3 (`telemetry-subagent-spans-design.md`)                                                       | A établi le motif de double émission (`qwen-code.subagent.id` + `gen_ai.agent.id`) et la règle « le nom privé est faisant autorité ». La Phase 4 suit la même convention pour les champs TTFT et les jetons.                                                                                                                        |
## Conception — sept décisions, chacune justifiée

### D1 — Sémantique du TTFT : « premier fragment contenant du contenu visible par l'utilisateur »

Le TTFT mesure le temps chronométré depuis l'envoi de la requête de la **tentative réussie** jusqu'au **premier fragment du flux contenant une sortie visible par l'utilisateur**. Un fragment est « visible par l'utilisateur » si une `Part` normalisée dans `candidates[0].content.parts` est l'un des éléments suivants :

- `text` avec une chaîne non vide
- `functionCall` (utilisation d'outil)
- `inlineData` (image, binaire)
- `executableCode`
- `thought` / contenu de raisonnement (peu importe comment le fournisseur le présente — `thought` de Gemini, bloc `<thinking>` d'Anthropic, fragment de raisonnement o1 d'OpenAI)

Les fragments contenant uniquement des métadonnées `role` ou uniquement `usageMetadata` (fragment récapitulatif d'utilisation final) ne déclenchent pas le TTFT.

**Pourquoi pas « premier événement de flux, quel qu'il soit » (choix de claude-code)** : claude-code mesure le TTFT à `message_start`, un événement de métadonnées spécifique à Anthropic qui se déclenche 50–300 ms avant tout contenu réel. Leur `headlessProfiler.ts` interne sépare déjà `time_to_first_response_ms` pour la sémantique « l'utilisateur a vu quelque chose », reconnaissant ainsi la distinction. qwen-code couvre plusieurs fournisseurs (Anthropic, OpenAI, Gemini, Qwen) — choisir la sémantique de l'événement de métadonnées signifierait que le TTFT pour Anthropic est fondamentalement différent du TTFT pour OpenAI (qui n'a pas d'événement initial analogue ne contenant que des métadonnées). La sémantique du contenu visible par l'utilisateur est uniforme pour les 4 fournisseurs et correspond littéralement au « temps jusqu'au premier jeton ».

**Pourquoi inclure `thought` / raisonnement** : du point de vue de l'opérateur, les fragments de raisonnement sont toujours « une sortie produite par le modèle ». Les exclure sous-estimerait le TTFT pour les modèles à fort raisonnement (o1, variantes Qwen thinking). Une future scission en `ttft_to_reasoning_ms` vs `ttft_to_answer_ms` est possible ; pas pour la Phase 4.

**Pourquoi inclure les fragments ne contenant qu'un appel d'outil** : les appels d'LLM pour la décision d'action d'agent (un `tool_use`, pas de texte) sont courants dans le flux de travail de qwen-code. Les exclure rendrait le TTFT indéfini pour ces requêtes. La `Part` `functionCall` est une sortie significative.

**Note de comparaison inter-produit** : le document de conception indique explicitement que `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Les opérateurs comparant différents produits doivent s'accorder sur la sémantique du contenu visible par l'utilisateur.

### D2 — Emplacement de la mesure du TTFT : variables locales de méthode dans `LoggingContentGenerator.generateContentStream`

La détection du premier fragment s'exécute dans l'enveloppe de flux existante à `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Les variables par appel (`start`, `ttftMs`) vivent dans la fermeture de la méthode ; **jamais comme champs d'instance**.

**Pourquoi jamais de champs d'instance** : `LoggingContentGenerator` est instancié **une fois par `ContentGenerator`** (`contentGenerator.ts:377`) et partagé entre tous les appels simultanés à `generateContentStream` — division en sous-agents, requêtes d'échauffement, sous-requêtes provenant de `geminiChat`. Un champ d'instance serait écrasé lors d'appels concurrents, produisant un TTFT absurde pour une requête sur deux parmi les requêtes entrelacées.

**Pourquoi pas AsyncLocalStorage** : ALS fonctionnerait mais ajoute une couche de gestion de contexte pour un état qui n'a pas besoin de sortir de la méthode. Les variables locales de méthode sont plus simples, sans surcoût, sans risque de fuite.

```ts
// loggingContentGenerator.ts — dans generateContentStream
const attemptStart = Date.now(); // locale par appel
const requestEntryTime = Date.now(); // également locale par appel — voir D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// l'enveloppe du flux inspecte chaque fragment ; le premier correspondant à hasUserVisibleContent :
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` est une petite fonction utilitaire autonome située au même endroit que l'enveloppe, exportée pour les tests :

```ts
function hasUserVisibleContent(chunk: GenerateContentResponse): boolean {
  const parts = chunk.candidates?.[0]?.content?.parts;
  if (!parts?.length) return false;
  return parts.some(
    (p) =>
      (typeof p.text === 'string' && p.text.length > 0) ||
      p.functionCall !== undefined ||
      p.inlineData !== undefined ||
      p.executableCode !== undefined ||
      // @ts-expect-error — `thought` n'est pas dans toutes les versions du SDK mais les fournisseurs l'émettent
      p.thought !== undefined,
  );
}
```

### D3 — Calcul de `request_setup_ms` : temps d'entrée vs début de la tentative réussie

`request_setup_ms` mesure le temps chronométré depuis l'entrée dans `generateContentStream`/`generateContent` jusqu'au **début de la tentative réussie** — incluant toutes les tentatives échouées, les pauses d'attente (backoff), et tout travail de préparation avant les tentatives.

```ts
request_setup_ms = attemptStart_de_la_tentative_réussie - requestEntryTime;
```

Lorsque `attempt === 1` et qu'aucune nouvelle tentative n'a eu lieu, `request_setup_ms` est faible (simple configuration du SDK). Lorsque des tentatives ont eu lieu, il capture la totalité du surcoût du budget de tentatives.

**Ajout sur la span OTel (divergence par rapport à claude-code, qui ne le met que sur Perfetto)** : justification à trois niveaux :

1. **Pas de Perfetto** — qwen-code n'a pas de couche de visualisation hors bande. Les attributs OTel sont le seul canal.
2. **Débogage en trace unique** — l'opérateur voit `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → diagnostique instantanément « les tentatives ont consommé 11,5 s, le modèle lui-même était rapide ». Calculer `request_setup_ms` à partir d'autres champs nécessite d'exposer également `sampling_ms`, ce que nous faisons de toute façon (D6).
3. **Coût négligeable** — 1 attribut INT64. Du même ordre de grandeur que les attributs existants `input_tokens`, `output_tokens`. Le coût d'ingestion côté backend n'est pas significatif.
### D4 — Télémétrie des tentatives : option de callback `onRetry` sur `retryWithBackoff` + `ApiRetryEvent` + propagation AsyncLocalStorage

> **Mise à jour Phase 4b (découverte post-conception)** : cette section était initialement rédigée en supposant le modèle de "une seule span LLM possède la boucle de reprise" de claude-code. Lors de l'implémentation de la Phase 4b, nous avons découvert que les 4 sites d'appel de `retryWithBackoff` de qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` — numéros de ligne au moment du merge) enveloppent tous `apiCall = () => contentGenerator.generateContent(...)`. La couche de reprise se situe **au-dessus** de LoggingContentGenerator. Chaque tentative de reprise appelle `apiCall()` à nouveau → nouvelle span `qwen-code.llm_request`. Il n'y a pas de span partagée unique entre les tentatives. Un accumulateur dans `LoggingContentGenerator` ne fonctionnerait pas.
>
> **Résolution** : propager l'état de reprise via `AsyncLocalStorage` (`retryContext` dans `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` enveloppe chaque `await fn()` dans `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` lit l'ALS dans son prélude synchrone et transmet les valeurs à `endLLMRequestSpan`. Cela donne en fait une **observabilité plus riche** que le plan initial — chaque span par tentative a son propre `duration_ms` / `ttft_ms` / détails d'erreur ET sait où elle se situe dans le budget de reprise via les attributs par tentative `attempt` / `requestSetupMs` / `retryTotalDelayMs`.
>
> L'approche ALS correspond aux motifs existants dans la base de code (`promptIdContext`, `subagentNameContext`, `agent-context`) — surface nouvelle minimale, sémantique bien comprise. Le processus de révision en mode plan a capturé cette révision à travers 3 cycles de révision qui ont trouvé 22 problèmes, tous résolus avant le merge.

`retryWithBackoff` appelle actuellement `logRetryAttempt` (`retry.ts:343`) qui écrit uniquement dans `debugLogger.warn`. Nous étendons l'interface `RetryOptions` avec un callback optionnel :

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... champs existants ...
  /**
   * Optionnel. Appelé une fois par tentative échouée, avant la pause de backoff.
   * Reçoit le numéro de tentative (à partir de 1), l'erreur et le délai avant
   * la prochaine tentative. Utilisez-le pour émettre des événements de télémétrie
   * pour les sites d'appel LLM ; laissez non défini pour les appelants non-LLM
   * (par ex., canaux/weixin) afin qu'ils restent silencieux dans les canaux de
   * télémétrie spécifiques aux LLM.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // à partir de 1, correspond à la sortie debugLogger
  error: unknown;
  errorStatus?: number;
  delayMs: number; // délai de backoff avant la tentative suivante
}
```

Les 4 sites d'appel LLM (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) enregistrent un callback qui émet un nouvel `ApiRetryEvent` :

```ts
// types.ts — nouvelle classe d'événement, jumelle de ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // à partir de 1
  error_type: string;
  error_message: string; // tronqué à 256 caractères
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms défini à retry_delay_ms pour que LogToSpanProcessor affiche
  // une span de pont de largeur significative
  duration_ms: number;
}
```

**Pourquoi une nouvelle classe d'événement, pas une extension de `ContentRetryEvent`** :

- `ContentRetryEvent` a 2 consommateurs en aval (qwen-logger, export log-record). Modifier sa charge utile risque de les casser.
- Le nom "content retry" fait sémantiquement référence aux reprises de récupération de contenu (flux invalide, réparation de schéma) — l'étendre pour couvrir les reprises pour limite de débit brouillerait le schéma.
- Le nouvel événement est additif ; pas de surprise pour le consommateur.

**Pourquoi ne pas intégrer le callback DANS `retry.ts`** : `retry.ts` est également appelé par `channels/weixin/src/api.ts` (reprises de l'API de messagerie Microsoft). Coupler la télémétrie LLM en dur dans retry.ts émettrait `ApiRetryEvent` pour les reprises non-LLM. Le callback `onRetry` est optionnel par appelant — les appelants LLM l'activent, l'appelant weixin ne le fait pas.

**Coexistence avec ContentRetryEvent** : ContentRetryEvent reste tel quel pour les reprises de récupération de contenu dans `geminiChat.ts:806,830`. ApiRetryEvent couvre les reprises pour limite de débit / erreurs 5xx provenant de `retryWithBackoff`. Les deux événements se déclenchent depuis des couches différentes et ne se dupliquent jamais. Le comportement existant du pont de logs pour les deux événements est préservé via `LogToSpanProcessor` — les deux événements se nichent automatiquement sous la span LLM active (le câblage de la Phase 1 garantit que la span LLM est active pendant les reprises).

**Mode de reprise persistante (`QWEN_CODE_UNATTENDED_RETRY`)** : une seule requête en boucle 429 peut émettre plus de 50 événements. Hors de portée de limiter l'émission dans la Phase 4 — si les volumes de production s'avèrent insupportables, ajoutez un plafonnement par span avec un événement récapitulatif dans une PR ultérieure. Les attributs agrégés `attempt` et `retry_total_delay_ms` sur la span LLM parente (D5) restent précis quelle que soit la limite d'événements.

### D5 — Agrégation de la span LLM parente : attributs scalaires uniquement (pas d'attributs de type map)

Les attributs de span OTel sont des scalaires (`string | number | boolean | tableau de ceux-ci`). Les attributs de type map (comme `retry_count_by_status: {429:2, 503:1}`) nécessitent une sérialisation JSON et sont peu pratiques à interroger. Ignorez-les.
| Attribut                  | Type   | Sémantique                                                                                                                              |
| -------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                  | int    | Compteur monotone basé sur 1 issu de `retryContext.attempt` (itération de cette tentative). Toujours renseigné (par défaut 1 lorsqu’il n’y a pas de contexte de relance). |
| `retry_total_delay_ms`     | int    | Durée d’attente exponentielle cumulée avant le début de cette tentative. Non défini pour les appels directs ; 0 pour la tentative 1 ; > 0 pour les tentatives suivantes. |
| `ttft_ms`                  | int    | TTFT par D1 ; non défini pour les requêtes non streamées ou abandonnées avant le premier bloc.                                         |
| `request_setup_ms`         | int    | Par D3                                                                                                                                  |
| `sampling_ms`              | int    | Par D6                                                                                                                                  |
| `output_tokens_per_second` | double | Dérivé ; `output_tokens / (sampling_ms / 1000)` ; non défini lorsque `sampling_ms === 0`.                                              |

La distribution des codes de statut par tentative (p. ex., « 2 des 3 tentatives étaient des 429 ») est interrogeable à partir des spans des enregistrements log-bridge des `ApiRetryEvent`. Il n’est pas nécessaire de la dupliquer comme un attribut aplati sur le parent.

**Pourquoi `sampling_ms` et `output_tokens_per_second` sur la span** : dérivables mais fastidieux à calculer dans les requêtes backend lors de l’agrégation sur de nombreuses spans. Même rapport coût-bénéfice que `request_setup_ms` (D3).

### D6 — Activer `recordApiRequestBreakdown()` pour 3 phases sur 4

Dans `endLLMRequestSpan` (ou le wrapper qui l’appelle), après avoir calculé TTFT / setup / sampling, émettre :

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = réseau + génération du premier token
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Pourquoi sauter `TOKEN_PROCESSING`** : qwen-code effectue le traitement du streaming des chunks en ligne (la consolidation se fait dans le wrapper à `loggingContentGenerator.ts:644`) ; la phase de post‑stream est <10ms et n’est pas architecturalement distincte. Remplir cette phase avec une valeur dénuée de sens polluerait l’histogramme. Laisser la valeur de l’enum inutilisée est sûr — `apiRequestBreakdownHistogram.record(value, {model, phase})` est simplement un histogramme avec `phase` comme label ; les labels absents sont simplement absents des requêtes.

**Pourquoi ne pas redéfinir `NETWORK_LATENCY`** : le nom de la spécification est légèrement trompeur (c’est réseau + génération du premier token, pas du pur temps de latence réseau), mais :

- L’enum fait partie de `metrics.ts:330-334`, exportée depuis `index.ts:117` et testée.
- Les tableaux de bord backend peuvent déjà référencer ces noms de phase.
- Renommer ou ajouter une nouvelle phase constituerait une rupture pour une amélioration de précision marginale et trivialement faible.

Documentez la sémantique dans le document de conception ; laissez l’enum inchangé.

**Pourquoi sur le chemin de la span, pas en parallèle** : cela maintient `recordApiRequestBreakdown` colocalisé avec les écritures d’attributs de span — un seul point d’émission conditionné (voir idempotence D7), un seul invariant d’ordonnancement.

### D7 — Idempotence de `endLLMRequestSpan` : enregistrement de métriques conditionné par la garde de double‑fin existante

La phase 1.5 (#4302) a établi que `endLLMRequestSpan` peut être appelée deux fois (collision chemin d’abandon + chemin d’erreur). La garde existante à `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) empêche un double `span.end()`. L’enregistrement de métriques de la phase 4 (D6) **doit se situer à l’intérieur du même bloc conditionné**, avant `span.end()` :

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // déjà terminée — garde de double‑fin
activeSpans.delete(spanRef);    // revendiquer la fin

// ... calculer la durée, définir les attributs ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // NOUVEAU — conditionné
  recordTokenUsageMetrics(...); // existant
}

span.end();
```

Cela garantit que la métrique est enregistrée **exactement une fois** par requête LLM, correspondant au cycle de vie de la span.

**Pourquoi ne pas enregistrer dans `loggingContentGenerator`** : il ne voit pas le chemin d’abandon. Enregistrer au niveau du cycle de vie de la span garantit que chaque requête LLM qui ouvre une span produit exactement un échantillon de décomposition, quel que soit le résultat (succès/échec/abandon).

### D8 — Double émission des conventions sémantiques GenAI (nom privé faisant autorité)

Chaque attribut de la phase 4 qui correspond à un attribut de convention sémantique OTel GenAI est écrit deux fois sur la span :

| qwen-code privé (faisant autorité)         | GenAI semconv (couche de compatibilité)            | Conversion d’unité      | Statut de la spécification |
| ------------------------------------------ | -------------------------------------------------- | ----------------------- | -------------------------- |
| `ttft_ms` (ms, int)                        | `gen_ai.server.time_to_first_token` (s, double)    | `ttftMs / 1000`         | Expérimental               |
| `input_tokens` (int)                       | `gen_ai.usage.input_tokens` (int)                  | Identique               | Stable                     |
| `output_tokens` (int)                      | `gen_ai.usage.output_tokens` (int)                 | Identique               | Stable                     |
| `cached_input_tokens` (int) (lorsqu’il est présent) | `gen_ai.usage.cached_tokens` (int)          | Identique               | Expérimental               |
| `qwen-code.model` (string)                 | `gen_ai.request.model` (string)                    | Identique               | Stable                     |
**Noms d’attributs existants des tokens** sur la span LLM (définis dans `endLLMRequestSpan` avant la Phase 4) : qwen-code utilise déjà les noms simples `input_tokens` et `output_tokens`. La Phase 4 ajoute les équivalents `gen_ai.usage.*` pour correspondre au modèle de #4410. Les noms simples restent ; **ne les renommez pas**.

Les champs sans équivalent dans les semconv GenAI — `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` — ne sont émis que sous l’espace de noms qwen-code.

**Pourquoi « privé faisant autorité, semconv comme compatibilité »** :

- Les tableaux de bord internes, les SLOs, la sortie debugLogger, le qwen-logger RUM, les requêtes ARMS — tout référence `ttft_ms` etc. Les traiter comme canoniques évite une migration en rupture.
- Les semconv GenAI expérimentales peuvent renommer `gen_ai.server.time_to_first_token` avant d’atteindre le statut Stable. Le cas échéant, nous mettons à jour l’émission semconv ; les noms qwen-code ne bougent pas.
- Les backends futurs conscients de la spécification (vues AI Datadog, Honeycomb AI, tableaux de bord AI ARMS) récupèrent automatiquement les attributs `gen_ai.*` sans notre intervention.

**Pourquoi double émission avec conversion d’unité** (ms ↔ secondes) : Les semconv GenAI ont choisi les secondes (flottant) pour la latence ; qwen-code a choisi les ms (entier, correspond à `duration_ms` déjà présent sur la span). Les deux représentations ont de la valeur ; la conversion est peu coûteuse.

## API auxiliaire (ajoutée à `session-tracing.ts`)

```ts
// session-tracing.ts — interface LLMRequestMetadata étendue (ajout)
export interface LLMRequestMetadata {
  // ... champs existants : inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Temps entre le début de la tentative réussie et le premier bloc de contenu visible (ms). Non défini pour les requêtes non streamées ou avortées avant le premier bloc. */
  ttftMs?: number;

  /** Temps entre l’entrée dans generateContent et le début de la tentative réussie (ms). Inclut tous les échecs de réessais + backoff. */
  requestSetupMs?: number;

  /** Numéro de la tentative finale (base 1). 1 = pas de réessai. */
  attempt?: number;

  /** Somme de tous les délais de backoff avant la tentative réussie (ms). */
  retryTotalDelayMs?: number;
}

// Pas de nouvelles fonctions exportées — La Phase 4 réutilise startLLMRequestSpan / endLLMRequestSpan avec des métadonnées étendues.
```

```ts
// types.ts — nouvelle classe d’événement
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY = EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number;
  error_type: string;
  error_message: string;
  status_code?: number;
  retry_delay_ms: number;
  duration_ms: number;  // = retry_delay_ms, alimente la largeur de la span pont LogToSpanProcessor

  constructor(opts: { model: string; promptId?: string; attemptNumber: number; error: unknown; statusCode?: number; retryDelayMs: number }) { ... }
}

// constants.ts
export const EVENT_API_RETRY = 'qwen-code.api_retry';

// loggers.ts
export function logApiRetry(config: Config, event: ApiRetryEvent): void { ... }
```

```ts
// utils/retry.ts — extension de RetryOptions
interface RetryOptions<T> {
  // ... existant ...
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number;
  error: unknown;
  errorStatus?: number;
  delayMs: number;
}

// Dans retryWithBackoff, là où logRetryAttempt est appelé aujourd’hui :
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // appel existant à debugLogger inchangé
```

## Câblage du cycle de vie

### Chemin streaming (cas courant)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Utilise startLLMRequestSpan existant (Phase 1)
  // Passe le callback onRetry à la couche de réessai utilisée :
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // on va démarrer la tentative N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // approximatif ; la réinitialisation réelle se fait en haut de la tentative suivante
    attemptStartTimes.push(attemptStart);
    // émet ApiRetryEvent
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // Le wrapper de flux détecte le premier bloc visible :
  return this.processStreamGenerator(stream, ..., {
    onFirstUserVisibleChunk: (now) => {
      ttftMs = now - attemptStart;
    },
  });
}
```

À la fin de la span (déjà dans le flux `endLLMRequestSpan` de la Phase 1), inclure les nouveaux champs dans `LLMRequestMetadata` :

```ts
endLLMRequestSpan(llmSpan, {
  success: true,
  inputTokens,
  outputTokens,
  cachedInputTokens,
  ttftMs,
  requestSetupMs: attemptStart - requestEntryTime,
  attempt: finalAttempt,
  retryTotalDelayMs,
});
```
### Chemin non-streaming

`generateContent` (`loggingContentGenerator.ts:212`) ne produit pas de chunks streaming. `TTFT` est `undefined` ; `request_setup_ms` reste pertinent (capture le surcoût des tentatives). La métrique de répartition enregistre 2 phases (REQUEST_PREPARATION + RESPONSE_PROCESSING où `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), pas 3.

### Intégration de la couche de retry (4 sites)

Chacun des 4 sites d'appel `retryWithBackoff` des LLM ajoute `onRetry` :

```ts
// client.ts:1540 (similar at baseLlmClient.ts:193, 282, geminiChat.ts:1039)
const result = await retryWithBackoff(apiCall, {
  ...existingOptions,
  onRetry: (info) => {
    logApiRetry(
      this.config,
      new ApiRetryEvent({
        model,
        promptId: userPromptId,
        attemptNumber: info.attempt,
        error: info.error,
        statusCode: info.errorStatus,
        retryDelayMs: info.delayMs,
      }),
    );
    // also feed back into LoggingContentGenerator's local retry accumulator
    // (when in scope — for callers that don't go through LoggingContentGenerator,
    // the LLM span still gets `attempt` and `retry_total_delay_ms` via the
    // metadata path because endLLMRequestSpan is called at the LLM layer)
  },
});
```

L'appelant non-LLM (`channels/weixin/src/api.ts`) **n'enregistre pas `onRetry`** — aucun `ApiRetryEvent` n'est émis pour ses tentatives, ce qui correspond au comportement actuel.

## Sécurité concurrente — la garantie phare

L'instance `LoggingContentGenerator` est partagée (une par `ContentGenerator`, `contentGenerator.ts:377`). Trois appels concurrents à `generateContentStream` (par exemple, 3 sous-agents qui se déploient via `coreToolScheduler.runConcurrently`) exécutent trois closures indépendantes de `generateContentStream` :

```
call_A: attemptStart_A, ttftMs_A, ... (closure)
call_B: attemptStart_B, ttftMs_B, ... (closure)
call_C: attemptStart_C, ttftMs_C, ... (closure)
```

Les variables locales par appel ne se chevauchent jamais. Les chunks streaming sont détectés par rapport au `attemptStart` local de chaque appel. Les attributs de span sont définis au propre `endLLMRequestSpan` de chaque appel.

`AsyncLocalStorageContextManager` (enregistré par NodeSDK dans `sdk.ts:273`) garantit déjà que le contexte OTel actif — et donc le span parent passé à `startLLMRequestSpan` — est correct par fibre.

## Fichiers à modifier

| File                                                                             | Change                                                                                                                                                                                                                                    | LOC est |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                                       | Ajouter la constante `EVENT_API_RETRY`                                                                                                                                                                                                    | +2      |
| `packages/core/src/telemetry/types.ts`                                           | Ajouter la classe `ApiRetryEvent` + membre d'union                                                                                                                                                                                        | +40     |
| `packages/core/src/telemetry/loggers.ts`                                         | Ajouter la fonction `logApiRetry()`                                                                                                                                                                                                       | +20     |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                         | Ajouter `logApiRetryEvent()` pour la cohérence RUM en aval                                                                                                                                                                                | +20     |
| `packages/core/src/telemetry/session-tracing.ts`                                 | Étendre `LLMRequestMetadata` (ttftMs, requestSetupMs, attempt, retryTotalDelayMs) ; étendre `endLLMRequestSpan` pour définir les nouveaux attributs + métrique de répartition + double émission gen_ai.\*                                    | +60     |
| `packages/core/src/telemetry/metrics.ts`                                         | Câbler le site d'appel `recordApiRequestBreakdown` à l'intérieur de `endLLMRequestSpan` (aucun changement à l'enregistreur existant)                                                                                                        | 0       |
| `packages/core/src/utils/retry.ts`                                               | Ajouter `onRetry?: (info: RetryAttemptInfo) => void` à RetryOptions ; exporter `RetryAttemptInfo` ; invoquer le callback dans le site logRetryAttempt existant                                                                            | +25     |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`      | Capture TTFT : accumulateurs locaux à la méthode + helper `hasUserVisibleContent` + détection du premier chunk dans le wrapper stream ; passer les nouvelles métadonnées à `endLLMRequestSpan`                                             | +80     |
| `packages/core/src/core/client.ts`                                               | Câbler le callback `onRetry` au site d'appel `retryWithBackoff` (`client.ts:1540`)                                                                                                                                                        | +15     |
| `packages/core/src/core/baseLlmClient.ts`                                        | Câbler le callback `onRetry` sur 2 sites d'appel `retryWithBackoff`                                                                                                                                                                       | +25     |
| `packages/core/src/core/geminiChat.ts`                                           | Câbler le callback `onRetry` au site d'appel `retryWithBackoff` (`geminiChat.ts:1039`)                                                                                                                                                    | +15     |
| `packages/core/src/telemetry/session-tracing.test.ts`                            | `endLLMRequestSpan` définit ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + double émission gen_ai + métrique de répartition (chaque phase) + fin idempotente                        | +120    |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts` | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only) ; les appels concurrents ne se contaminent pas ; TTFT est `undefined` en cas d'abandon avant le premier chunk ; TTFT est `undefined` en mode non-streaming | +100    |
| `packages/core/src/utils/retry.test.ts`                                          | `onRetry` invoqué par tentative échouée avec les bons `attempt`, `delayMs`, `error`, `errorStatus` ; l'absence de `onRetry` est silencieuse (aucune télémétrie émise)                                                                      | +50     |
| `packages/core/src/telemetry/loggers.test.ts`                                    | `logApiRetry` émet un LogRecord avec la charge utile attendue ; pont via LogToSpanProcessor vers un span imbriqué sous le span LLM actif                                                                                                    | +40     |
Total : 14 fichiers, ~610 LOC. Plus volumineux que la Phase 2 (#4321) mais comparable à la Phase 3 (#4410) et justifié par l'étendue de l'intégration (4 sites de relance + plomberie de télémétrie + wrapper de streaming).

Si la révision conteste la taille, découper en **Phase 4a + 4b + 4c** :

- **4a** (~200 LOC) : capture du TTFT + extension de `LLMRequestMetadata` + double émission. D'une valeur autonome (visibilité du TTFT dès le premier jour).
- **4b** (~250 LOC) : callback `onRetry` + `ApiRetryEvent` + câblage des 4 appelants. **Indépendamment, une correction de bug** pour le trou de télémétrie de `retryWithBackoff`.
- **4c** (~160 LOC) : activation de `recordApiRequestBreakdown` + attributs d'agrégation du span parent (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Dépend de 4a + 4b.

## Stratégie de test

| Test                                                                                                                                         | Ce qu'il prouve                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `hasUserVisibleContent` retourne true pour text/functionCall/inlineData/executableCode/thought                                               | Sémantique D1 entre les types de partie |
| `hasUserVisibleContent` retourne false pour les morceaux role-only et usage-only                                                             | Cas négatifs D1                         |
| streaming : TTFT mesuré du début de la tentative au premier morceau visible par l'utilisateur                                                | Détection bout en bout du TTFT          |
| streaming : TTFT indéfini si le flux est interrompu avant tout morceau visible par l'utilisateur                                             | Cas limite                             |
| streaming : TTFT calculé à partir du début de la dernière tentative (pas de la première)                                                     | D3 — réinitialisation du TTFT en cas de relance |
| non-streaming : TTFT reste indéfini                                                                                                          | Décision S3                            |
| Les appels concurrents à `generateContentStream` ne se contaminent pas mutuellement sur le TTFT                                              | D2 — garantie locale à la méthode      |
| `endLLMRequestSpan` définit tous les attributs de la Phase 4 (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Présence des attributs                  |
| `endLLMRequestSpan` émet deux fois gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model                               | D8 double émission                     |
| `endLLMRequestSpan` enregistre la métrique de décomposition avec 3 phases pour le streaming, 2 pour le non-streaming                        | D6                                     |
| `endLLMRequestSpan` appelé deux fois : la métrique est enregistrée exactement une fois, les attributs ne sont pas réinitialisés             | D7 idempotence                         |
| `retryWithBackoff` avec `onRetry` : le callback est invoqué par tentative échouée avec les bons arguments                                    | D4 contrat du callback                 |
| `retryWithBackoff` sans `onRetry` : aucune télémétrie émise (silencieux pour les appelants non LLM)                                          | P2 — protection de scope channels/weixin |
| Les sites de relance dans `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` émettent `ApiRetryEvent` en cas de relance                      | Intégration de D4 sur 4 sites          |
| Le LogRecord `ApiRetryEvent` est ponté via LogToSpanProcessor vers un span enfant sous le span LLM actif                                    | Exactitude de l'arbre des traces       |
| Le champ `attempt` du span LLM reflète correctement le numéro de la dernière tentative en cas de relances                                   | Agrégation D5                          |
| Le champ `retry_total_delay_ms` du span LLM additionne correctement les délais onRetry                                                       | Agrégation D5                          |
| `output_tokens_per_second` indéfini quand `sampling_ms === 0` (pas de streaming)                                                            | Éviter la division par zéro            |

## Cas limites

| Cas                                                                     | Gestion                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le flux est interrompu avant l'arrivée d'un quelconque morceau          | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` toujours définis. `success = false`                                                                 |
| Le flux est interrompu après le premier morceau                         | `ttftMs` défini ; `sampling_ms` = `duration_ms - ttftMs - request_setup_ms` ; reflète le temps de réponse partiel. `success = false`                                                                                       |
| La relance réussit à la tentative 1 (pas de relance)                    | `attempt = 1`, `retry_total_delay_ms = 0`, aucun `ApiRetryEvent` émis, la métrique de décomposition enregistre `request_setup_ms` proche de 0                                                                              |
| Mode de relance persistant avec 50+ tentatives                           | 50+ enregistrements `ApiRetryEvent` émis (plafond hors scope reporté) ; le span LLM a `attempt = 51`, `retry_total_delay_ms = somme de tous les délais`. L'opérateur voit la vue agrégée sur le span ; détails complets par tentative dans les spans pontés de logs |
| Appelant non-LLM de `retryWithBackoff` (channels/weixin)                | Aucun `onRetry` enregistré ; seul le `debugLogger.warn` existant se déclenche. Aucun `ApiRetryEvent` ; aucune métrique de décomposition (l'appelant n'est pas un site LLM)                                                |
| `endLLMRequestSpan` appelé deux fois (course entre abandon et erreur)   | La garde de la Phase 1.5 à `activeSpans.delete()` retourne tôt lors du second appel ; `recordApiRequestBreakdown` est à l'intérieur de la garde, enregistré exactement une fois                                            |
| Le morceau `message_start` d'Anthropic arrive avant le contenu          | `hasUserVisibleContent` retourne false pour celui-ci (aucune partie avec text/functionCall/etc.) ; le TTFT n'est pas déclenché jusqu'au morceau `content_block_delta` suivant                                            |
| Premier morceau OpenAI avec `delta.content` vide mais `role` seulement  | `hasUserVisibleContent` retourne false ; le TTFT n'est pas déclenché jusqu'au premier morceau avec delta non vide                                                                                                         |
| Réponse uniquement par appel d'outil (pas de texte)                     | Le premier morceau avec une Part `functionCall` déclenche le TTFT ; `output_tokens_per_second` calculé par rapport au nombre de tokens d'appel d'outil                                                                   |
| Sous-agents concurrents (3 appels en vol)                               | Chaque appel a son propre `attemptStart`, `ttftMs`, `attemptStartTimes` dans la fermeture. Le span de chaque appel reçoit ses propres métadonnées à `endLLMRequestSpan`. Pas d'entrelacement (D2)                          |
| Relances au niveau SDK dans openai-sdk (`maxRetries=3`)                  | Invisible à la télémétrie de qwen-code — se produit entièrement à l'intérieur du SDK avant que retryWithBackoff ne voie la requête. `attempt` reflète seulement les tentatives de retryWithBackoff. Hors scope (voir Hors scope) |
| Renommage de la spécification `gen_ai.server.time_to_first_token` avant d'atteindre Stable | Mise à jour dans un seul fichier : `session-tracing.ts:endLLMRequestSpan`. Le `ttft_ms` natif de qwen-code reste faisant autorité — aucun impact en aval                                                                 |
| Requête LLM d'un sous-agent                                            | Le parent est le span du sous-agent (Phase 3). Les champs de la Phase 4 s'imbriquent correctement. Les agrégations groupées par `qwen-code.subagent.id` donnent les performances LLM par sous-agent — doc concept future, suivi facile |
| Modèle de raisonnement avec longs blocs de pensée                       | La première Part `thought` déclenche le TTFT ; `sampling_ms` inclut les phases de réflexion + réponse. La division en métriques séparées est reportée                                                                      |
## Retour arrière

Le changement est additif au niveau OTel et métrique — chaque nouvel attribut est facultatif, chaque nouvel événement est une nouvelle classe. Les tableaux de bord existants qui ne filtrent pas sur les nouveaux champs continuent de fonctionner sans modification.

Modifications affectant le comportement :

- Nouveau LogRecord `ApiRetryEvent` commence à circuler → le volume de logs augmente proportionnellement au taux de tentatives (généralement <1 % des requêtes sont retentées). Atténuez en échantillonnant le LogRecord au niveau SDK si nécessaire.
- Nouvelle métrique de répartition `qwen-code.api.request.breakdown` commence à produire des séries temporelles → légère augmentation de cardinalité Prometheus (`{model, phase}` — bornée).
- L'attribut dérivé `output_tokens_per_second` peut sembler inhabituel sur les tableaux de bord filtrant « tous les attributs » — documentez.

Chemin de retour arrière : annulez la PR unique (ou chacune de 4a/4b/4c indépendamment). Tous les nouveaux champs utilisent des valeurs par défaut défensives (undefined / 0) et ne modifient pas la structure des spans.

## Séquencement

- **Après la phase 3 (#4410, en cours de revue)** : ce n'est pas une dépendance stricte. Les attributs de la phase 4 se rattachent aux spans `qwen-code.llm_request` qu'ils soient sous un parent `qwen-code.subagent` (phase 3) ou `qwen-code.interaction` (phase 1). Il est recommandé que la phase 3 soit déployée en premier pour que l'agrégation par tentative dans les sous-arbres de subagent fonctionne naturellement.
- **Indépendant de #4384** (propagation sortante `traceparent` + `X-Qwen-Code-Session-Id`). Ils concernent la couche HTTP ; la phase 4 concerne la couche flux/tentatives/métriques.
- **Indépendant du suivi de compression de chat `clearDetailedSpanState`** (suivi de #4097). Surface différente.

## Questions en suspens

1. **Sémantique de déclenchement du callback `onRetry`** : invoqué **avant** la pause de backoff (proposition actuelle) ou **après** (quand la prochaine tentative est sur le point de commencer) ? Avant est plus simple — le callback a toutes les informations immédiatement ; après nécessiterait de capturer le délai venant de se terminer séparément. La recommandation est avant le sommeil ; documentez dans le contrat du callback.
2. **Timing par tentative sur la span LLM** : devrions-nous ajouter un tableau `attempt_durations_ms: number[]` ? OTel prend en charge les attributs de type tableau de primitives. Utile pour le diagnostic « quelle tentative parmi N était lente ». Reportez jusqu'à ce que les données de production montrent une demande — les spans log-bridge portent déjà l'équivalent.
3. **Limite d'émission en mode de tentative persistante** : à quel seuil `attempt > N` devrions-nous commencer l'échantillonnage ? `N = 5` puis 1 sur 10 ? `N = 10` puis résumé uniquement ? Reportez jusqu'à ce que nous ayons des données de volume en production.
4. **Phase `TOKEN_PROCESSING`** : garder la valeur d'énumération dormante ou la connecter à quelque chose (par exemple, temps de consolidation) ? Reportez — attendez un cas d'usage réel.
5. **Regroupements LLM au niveau du subagent** : suivi trivial une fois la phase 4 déployée — somme `ttft_ms`/`output_tokens`/`input_tokens` par sous-arbre de subagent. Ce n'est pas dans le périmètre de la phase 4, mais le flux de données le permet.
