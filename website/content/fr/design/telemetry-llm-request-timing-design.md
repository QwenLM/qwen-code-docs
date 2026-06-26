# Conception de la Décomposition Temporelle des Requêtes LLM (P3 Phase 4)

> Issue #3731 — Phase 4 du tracing hiérarchique des sessions. Ajoute le temps jusqu'au premier token, la durée de configuration de la requête, la durée d'échantillonnage et la télémétrie de tentative par tentative à la span `qwen-code.llm_request`, permettant aux opérateurs de répondre à la question « pourquoi cet appel LLM était-il lent ? » sans avoir à deviner.
>
> S'appuie sur la Phase 1 (#4126), la Phase 1.5 (#4302), la Phase 2 (#4321). Indépendant de la Phase 3 (#4410, en relecture) — il est recommandé de livrer la Phase 3 en premier pour que les champs par tentative de la Phase 4 s'agrègent proprement sous les arborescences des sous-agents.

## Problème

Les spans `qwen-code.llm_request` ne portent aujourd'hui que `model`, `prompt_id`, `input_tokens`, `output_tokens`, `success`, `error`, `duration_ms`. Les opérateurs qui lisent une trace unique ne peuvent pas déterminer :

1. **Quelle part de `duration_ms` correspond à la réflexion du modèle vs la configuration réseau.** Une `duration_ms` de 12 s pourrait être 11 s de tentatives suivies de 1 s de génération rapide, ou 100 ms de configuration suivies de 12 s de streaming lent — la trace ne le dit pas.
2. **Quand l'utilisateur a vu le premier token.** Le TTFT (time-to-first-token) est le SLO de latence standard pour les interfaces de chat. Nous ne pouvons pas le calculer ; nous ne le capturons pas.
3. **Ce qui s'est passé pendant les tentatives.** `retryWithBackoff` (`utils/retry.ts:285`) appelle seulement `debugLogger.warn` — pas d'événement OTel, pas d'attribut de span. Les 4 sites d'appel LLM qui passent par cette fonction (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) n'ont aucune visibilité sur les tentatives dans les traces ou les métriques. `ContentRetryEvent` existe pour les tentatives de récupération de contenu à l'intérieur de `geminiChat.ts:806,830` mais pas pour les tentatives plus courantes liées aux limites de débit / erreurs 5xx.
4. **Que `api.request.breakdown` est du code mort.** La métrique est définie dans `metrics.ts:242-251` avec 4 valeurs `ApiRequestPhase`, exportée depuis `index.ts:117`, testée dans `metrics.test.ts:646-675` — mais `recordApiRequestBreakdown()` n'a aucun appelant dans le code de production. L'infrastructure de métriques est payée ; le flux de données n'a jamais été connecté.

Ces lacunes font de `qwen-code.llm_request` la span la moins informative de l'arbre de trace. Les spans d'outil (#4126/#4321) et les spans de sous-agent (#4410) exposent toutes les deux des phases du cycle de vie ; les spans LLM réduisent l'ensemble de la requête à une durée opaque unique.

## Surface existante (inchangée)

| Composant                                                    | Emplacement                                                         | Pourquoi nous n'y touchons pas                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cycle de vie de la span de requête LLM                       | `session-tracing.ts` `startLLMRequestSpan` / `endLLMRequestSpan`    | La Phase 1 (#4126) a établi les helpers. Nous étendons l'interface des métadonnées, nous ne restructurons pas                                                                                                                                                                                                                  |
| Propagation de la span active dans les générateurs de provider | `loggingContentGenerator.ts:213,287`                                | La Phase 1 (#4126) a remplacé `withSpan('api.*')` par des helpers natifs ; le contexte actif atteint déjà le wrapper de flux                                                                                                                                                                                                    |
| Schéma et consommateurs de `ContentRetryEvent`                | `types.ts:626`, `qwen-logger.ts:947`, `loggers.ts:717`              | L'événement existant conserve sa forme et ses avals ; nous ajoutons une classe d'événement sœur pour le chemin `retryWithBackoff`                                                                                                                                                                                               |
| Spans de pont de log `LogToSpanProcessor`                     | `log-to-span-processor.ts`                                          | Le pont existant de ContentRetryEvent continue de s'imbriquer sous la span LLM active. La Phase 4 ne modifie pas cela                                                                                                                                                                                                           |
| Énumération `ApiRequestPhase`                                 | `metrics.ts:330-334`                                                | Surface publique (4 valeurs). Nous peuplons 3 des 4 à partir du code de production ; nous laissons l'énumération inchangée pour la rétrocompatibilité                                                                                                                                                                           |
| Normalisation des chunks par provider → `GenerateContentResponse` | `loggingContentGenerator.ts:286-393`                                | Chaque provider normalise déjà vers la forme `GenerateContentResponse` de Google avant que LoggingContentGenerator ne voie le flux. La détection du TTFT s'exécute de manière centralisée sur cette forme normalisée ; aucun code par provider                                                                                                                                          |
| `retryWithBackoff` tentative générale                          | `utils/retry.ts:140`                                                | Utilisé à la fois par les appelants LLM et non-LLM (`channels/weixin/src/api.ts`). Nous étendons avec un callback optionnel `onRetry` plutôt que de coupler fortement à la télémétrie LLM                                                                                                                                       |
| `generateContent` non streamé                                  | `loggingContentGenerator.ts:212`                                    | Le TTFT n'a pas de sens pour le non streamé ; les nouveaux champs restent `undefined`. Cycle de vie de la span et attributs existants inchangés                                                                                                                                                                                  |

## Hors périmètre (reporté)

- **Tentatives au niveau SDK** (`maxRetries=3` du SDK openai, tentatives internes du SDK google-genai). Elles se produisent entièrement à l'intérieur du SDK tiers ; les observer nécessite de désactiver les tentatives du SDK et de les réimplémenter dans `retryWithBackoff`. Décision séparée, pas pour la Phase 4.
- **Métriques de streaming par token** (latence inter-token, taille par chunk). Utiles pour le débogage des performances du moteur d'inférence, pas pour les questions de latence perçue par l'utilisateur que cible la Phase 4.
- **TTFT séparé pour les blocs de raisonnement/réflexion.** Le « premier token » inclut le contenu de réflexion (voir D1). Une amélioration future pourrait diviser `ttft_to_reasoning_ms` vs `ttft_to_answer_ms`, mais seulement après avoir confirmé la demande.
- **Phase d'échantillonnage en tant que span enfant dédiée.** Calculable à partir de `duration_ms - ttft_ms - request_setup_ms` ; une span enfant n'apporte rien pour les backends OTel uniquement (claude-code en utilise une pour Perfetto uniquement). Stockée comme attribut de span à la place — voir D6.
- **Limitation du taux d'événements en mode de tentative persistante (`QWEN_CODE_UNATTENDED_RETRY`).** Une seule requête LLM peut produire plus de 50 enregistrements `ContentRetryEvent` / `ApiRetryEvent` en mode de tentative persistante. Limiter l'émission est un suivi — la Phase 4 émet tous les événements ; si les volumes de production s'avèrent insupportables, ajouter un plafond d'émission par span avec un événement récapitulatif « +N tentatives supplémentaires (tronquées) » dans une PR ultérieure.
- **Phase `TOKEN_PROCESSING`.** La valeur de l'énumération existe, mais qwen-code n'a pas de traitement local réel après le streaming qui mérite d'être mesuré (<10 ms typiquement). Ignorée dans les appelants de production ; valeur de l'énumération conservée pour une utilisation future ou pour les appelants que nous ne contrôlons pas.
- **Migration de `ContentRetryEvent` vers la span LLM en tant qu'événements de span.** Même raisonnement que pour la Phase 3 et `subagent_execution` LogRecord : les consommateurs existants (qwen-logger RUM, métriques futures) sont fortement couplés au LogRecord. La couverture de la span de pont est suffisante.

## Références (preuves de décision)

| Source                                                                                                                      | Enseignement clé                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| claude-code (Anthropic) `claude.ts:1762, 1789, 1982, 2882`                                                                  | TTFT capturé comme `Date.now() - start` sur l'événement SSE `message_start` ; `start` réinitialisé par tentative. `requestSetupMs = start - startIncludingRetries`. Tableau `attemptStartTimes` conservé par tentative. Confirme la faisabilité de l'approche ; leur sémantique TTFT est « premier événement de flux » (nous divergeons vers « premier contenu » — voir D1) |
| claude-code `perfettoTracing.ts:549-671`                                                                                    | Affiche Configuration de la requête → Tentative N (nouvel essai) → Premier token → Échantillonnage sous forme de paires B/E imbriquées. Démontre la décomposition visuelle ; qwen-code effectue la même décomposition avec des attributs OTel puisque nous n'avons pas Perfetto                                                                                                                |
| claude-code `sessionTracing.ts:447`                                                                                         | Seul `ttft_ms` arrive sur la span OTel (pas `requestSetupMs`, pas `samplingMs`, pas les temps par tentative). Nous mettons délibérément plus d'informations sur la span — claude-code a Perfetto pour la visualisation ; nous pas                                                                                                                                                           |
| opencode (sst/opencode) `session/llm.ts`, `route/client.ts`                                                                 | Pas de mesure TTFT. Une seule span `LLM.run` Effect couvre tout. Valide que cette lacune existe dans tous les outils concurrents ; pas une référence sur quoi faire                                                                                                                                                              |
| [Conventions sémantiques GenAI OTel](https://opentelemetry.io/docs/specs/semconv/gen-ai/) (statut : Développement / Expérimental) | `gen_ai.usage.input_tokens` (Stable), `gen_ai.usage.output_tokens` (Stable), `gen_ai.usage.cached_tokens` (Expérimental), `gen_ai.request.model` (Stable), `gen_ai.server.time_to_first_token` (Expérimental, secondes en double). Le motif d'émission double suit le précédent de #4410                                                        |
| [Spécification de Trace OTel — Événements de Span](https://opentelemetry.io/docs/specs/otel/trace/api/#add-events)           | « Les événements NE DEVRAIENT PAS être utilisés pour enregistrer des informations mieux capturées comme Attributs de Span. » Confirme que les informations par tentative appartiennent aux attributs de la span LLM + aux spans de pont de log, et non comme Événements de Span sur la parente                                                                                                                     |
| Document de conception Phase 3 (`telemetry-subagent-spans-design.md`)                                                       | A établi le motif d'émission double (`qwen-code.subagent.id` + `gen_ai.agent.id`) et la règle « le nom privé fait autorité ». La Phase 4 suit la même convention pour TTFT et les champs de token                                                                                                                                        |

## Conception — sept décisions, chacune justifiée

### D1 — Sémantique TTFT : « premier chunk contenant du contenu visible par l'utilisateur »

Le TTFT mesure le temps mural depuis l'envoi de la **tentative réussie** jusqu'au **premier chunk du flux qui contient une sortie visible par l'utilisateur**. Un chunk est « visible par l'utilisateur » si toute `Part` normalisée dans `candidates[0].content.parts` est l'une des suivantes :

- `text` avec une chaîne non vide
- `functionCall` (utilisation d'outil)
- `inlineData` (image, binaire)
- `executableCode`
- `thought` / contenu de raisonnement (quelle que soit la surface du provider — `thought` de Gemini, bloc `<thinking>` d'Anthropic, chunk de raisonnement d'OpenAI o1)

Les chunks contenant uniquement des métadonnées de `role` ou uniquement `usageMetadata` (chunk récapitulatif d'utilisation final) ne déclenchent pas le TTFT.

**Pourquoi pas « premier événement de flux, quel qu'il soit » (choix de claude-code)** : claude-code mesure le TTFT à `message_start`, un événement de métadonnées spécifique à Anthropic qui se déclenche 50 à 300 ms avant tout contenu réel. Leur `headlessProfiler.ts` interne sépare déjà `time_to_first_response_ms` pour la sémantique « l'utilisateur a vu quelque chose », reconnaissant la distinction. qwen-code couvre plusieurs providers (Anthropic, OpenAI, Gemini, Qwen) — choisir la sémantique de l'événement de métadonnées signifierait que le TTFT pour Anthropic est fondamentalement différent du TTFT pour OpenAI (qui n'a pas d'événement métadonnées analogique unique). La sémantique de contenu visible par l'utilisateur est uniforme pour les 4 providers et correspond littéralement au « temps jusqu'au premier token ».

**Pourquoi inclure `thought` / raisonnement** : du point de vue de l'opérateur, les chunks de raisonnement sont toujours « le modèle a produit une sortie ». Les exclure sous-estimerait le TTFT pour les modèles axés sur le raisonnement (o1, variantes de réflexion de Qwen). Une future séparation en `ttft_to_reasoning_ms` vs `ttft_to_answer_ms` est possible ; pas pour la Phase 4.

**Pourquoi inclure les chunks d'appel d'outil uniquement** : les appels LLM pour décision d'outil d'agent (un `tool_use`, pas de texte) sont courants dans le flux de travail de qwen-code. Les exclure signifie que le TTFT n'est pas défini pour ces requêtes. La Part `functionCall` est une sortie significative.

**Note de comparaison entre produits** : le document de conception indique explicitement que `qwen-code.ttft_ms ≈ claude-code.time_to_first_response_ms ≠ claude-code.ttft_ms`. Les opérateurs comparant différents produits doivent s'aligner sur la sémantique de contenu visible par l'utilisateur.

### D2 — Site de mesure TTFT : variables locales de méthode dans `LoggingContentGenerator.generateContentStream`

La détection du premier chunk s'exécute à l'intérieur du wrapper de flux existant à `loggingContentGenerator.ts:393` (`async function* processStreamGenerator`). Les variables par appel (`start`, `ttftMs`) vivent dans la fermeture de la méthode ; **jamais comme champs d'instance**.

**Pourquoi jamais comme champs d'instance** : `LoggingContentGenerator` est instancié **une fois par `ContentGenerator`** (`contentGenerator.ts:377`) et partagé entre tous les appels `generateContentStream` concurrents — fan-out de sous-agents, requêtes de préchauffage, requêtes annexes de `geminiChat`. Un champ d'instance serait écrasé entre les appels concurrents, produisant un TTFT absurde pour une requête sur deux entrelacées.

**Pourquoi pas AsyncLocalStorage** : ALS fonctionnerait mais ajoute une couche de gestion de contexte pour un état qui n'a pas besoin de sortir de la méthode. Les variables locales de méthode sont plus simples, zéro surcharge, zéro risque de fuite.

```ts
// loggingContentGenerator.ts — à l'intérieur de generateContentStream
const attemptStart = Date.now(); // locale par appel
const requestEntryTime = Date.now(); // également locale par appel — voir D3
let ttftMs: number | undefined;
const attemptStartTimes: number[] = [attemptStart];
let retryTotalDelayMs = 0;
let finalAttempt = 1;
// le wrapper de flux inspecte chaque chunk ; le premier correspondant à hasUserVisibleContent :
//   ttftMs = Date.now() - attemptStart;
```

`hasUserVisibleContent(chunk)` est un petit helper autonome colocalisé avec le wrapper, exporté pour les tests :

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
      // @ts-expect-error — `thought` n'est pas sur toutes les versions du SDK mais les providers l'émettent
      p.thought !== undefined,
  );
}
```

### D3 — Calcul de `request_setup_ms` : temps d'entrée vs début de la tentative réussie

`request_setup_ms` mesure le temps mural depuis l'entrée dans `generateContentStream`/`generateContent` jusqu'au **début de la tentative réussie** — incluant toutes les tentatives échouées, les pauses de backoff, et tout travail préparatoire avant la tentative.

```ts
request_setup_ms = attemptStart_de_la_tentative_réussie - requestEntryTime;
```

Quand `attempt === 1` et qu'aucune tentative n'a eu lieu, `request_setup_ms` est faible (juste la configuration du SDK). Quand des tentatives ont eu lieu, cela capture l'intégralité du surcoût du budget de tentatives.

**Le placer sur la span OTel (divergence avec claude-code, qui le place uniquement sur Perfetto)** : justification à trois niveaux :

1. **Pas de Perfetto** — qwen-code n'a pas de couche de visualisation externe. Les attributs OTel sont le seul canal.
2. **Débogage de trace unique** — l'opérateur voit `duration_ms=12000, request_setup_ms=11500, ttft_ms=200, sampling_ms=300` → diagnostique instantanément « les tentatives ont pris 11,5 s, le modèle lui-même était rapide ». Calculer `request_setup_ms` à partir d'autres champs nécessite aussi d'exposer `sampling_ms`, ce que nous faisons de toute façon (D6).
3. **Coût négligeable** — 1 attribut INT64. Du même ordre de grandeur que les attributs existants `input_tokens`, `output_tokens`. Le coût d'ingestion du backend n'est pas significatif.

### D4 — Télémétrie des tentatives : callback optionnel `onRetry` sur `retryWithBackoff` + `ApiRetryEvent` + propagation AsyncLocalStorage

> **Mise à jour Phase 4b (découverte post-conception)** : cette section a été écrite à l'origine en supposant le motif « une span LLM possède la boucle de tentatives » de claude-code. En implémentant Phase 4b, nous avons découvert que les 4 sites d'appel `retryWithBackoff` de qwen-code (`client.ts:2109`, `baseLlmClient.ts:235,333`, `geminiChat.ts:2035` — numéros de ligne au moment de la fusion) enveloppent tous `apiCall = () => contentGenerator.generateContent(...)`. La couche de tentatives se situe **au-dessus** de LoggingContentGenerator. Chaque tentative appelle `apiCall()` à nouveau → nouvelle span `qwen-code.llm_request`. Il n'y a pas de span partagée unique entre les tentatives. Un accumulateur dans `LoggingContentGenerator` ne fonctionnerait pas.
>
> **Résolution** : propager l'état des tentatives via `AsyncLocalStorage` (`retryContext` dans `packages/core/src/utils/retryContext.ts`). `retryWithBackoff` enveloppe chaque `await fn()` dans `retryContext.run({ attempt, requestSetupMs, retryTotalDelayMs }, fn)`. `LoggingContentGenerator` lit le ALS dans son prélude synchrone et transmet les valeurs à `endLLMRequestSpan`. Cela donne en fait une **observabilité plus riche** que le plan initial — chaque span par tentative a sa propre `duration_ms` / `ttft_ms` / détails d'erreur ET sait où elle se situe dans le budget de tentatives grâce aux attributs `attempt` / `requestSetupMs` / `retryTotalDelayMs` par tentative.
>
> L'approche ALS correspond aux motifs existants dans le codebase (`promptIdContext`, `subagentNameContext`, `agent-context`) — surface minimale nouvelle, sémantique bien comprise. Le processus de révision en mode plan a capturé cette révision en 3 cycles de relecture trouvant 22 problèmes, tous résolus avant la fusion.

`retryWithBackoff` appelle actuellement `logRetryAttempt` (`retry.ts:343`) qui écrit seulement dans `debugLogger.warn`. Nous étendons l'interface `RetryOptions` avec un callback optionnel :

```ts
// utils/retry.ts
interface RetryOptions<T> {
  // ... champs existants ...
  /**
   * Optionnel. Appelé une fois par tentative échouée, avant la pause de backoff.
   * Reçoit le numéro de tentative (base 1), l'erreur et le délai avant
   * la tentative suivante. Utilisez-le pour émettre des événements de télémétrie
   * pour les sites d'appel LLM ; laissez undefined pour les appelants non-LLM
   * (par exemple, channels/weixin) afin qu'ils restent silencieux dans les canaux
   * de télémétrie spécifiques aux LLM.
   */
  onRetry?: (info: RetryAttemptInfo) => void;
}

interface RetryAttemptInfo {
  attempt: number; // base 1, correspond à la sortie de debugLogger
  error: unknown;
  errorStatus?: number;
  delayMs: number; // délai de backoff avant la tentative suivante
}
```

Les 4 sites d'appel LLM (`client.ts:1540`, `baseLlmClient.ts:193,282`, `geminiChat.ts:1039`) enregistrent un callback qui émet un nouvel `ApiRetryEvent` :
```ts
// types.ts — nouvelle classe d'événement, similaire à ContentRetryEvent
export class ApiRetryEvent implements BaseTelemetryEvent {
  'event.name': typeof EVENT_API_RETRY;
  'event.timestamp': string;
  model: string;
  prompt_id?: string;
  attempt_number: number; // base 1
  error_type: string;
  error_message: string; // tronqué à 256 caractères
  status_code?: number;
  retry_delay_ms: number;
  // ... duration_ms défini à retry_delay_ms pour que LogToSpanProcessor affiche
  // une span de pont d'une largeur significative
  duration_ms: number;
}
```

**Pourquoi une nouvelle classe d'événement, et non une extension de `ContentRetryEvent`** :

- `ContentRetryEvent` a 2 consommateurs aval (qwen-logger, export log-record). Modifier sa charge utile risque de les casser.
- Le nom « content retry » fait sémantiquement référence aux nouvelles tentatives de récupération de contenu (flux invalide, réparation de schéma) — l'étendre pour couvrir les nouvelles tentatives de limitation de débit brouillerait le schéma.
- Le nouvel événement est additif ; aucun consommateur n'est surpris.

**Pourquoi ne pas intégrer le callback DANS `retry.ts`** : `retry.ts` est également appelé par `channels/weixin/src/api.ts` (nouvelles tentatives de l'API Microsoft Messaging). Coupler en dur la télémétrie LLM dans `retry.ts` émettrait `ApiRetryEvent` pour des nouvelles tentatives non-LLM. Le callback `onRetry` est optionnel par appelant — les appelants LLM l'activent, l'appelant weixin ne le fait pas.

**Coexistence avec ContentRetryEvent** : ContentRetryEvent reste tel quel pour les nouvelles tentatives de récupération de contenu dans `geminiChat.ts:806,830`. ApiRetryEvent couvre les nouvelles tentatives de limitation de débit / erreurs 5xx de `retryWithBackoff`. Les deux événements se déclenchent depuis des couches différentes et ne se dupliquent jamais. Le comportement existant du pont de log pour les deux événements est préservé via `LogToSpanProcessor` — les deux événements se nichent automatiquement sous la span LLM active (le câblage de la Phase 1 garantit que la span LLM est active pendant les nouvelles tentatives).

**Mode de nouvelle tentative persistante (`QWEN_CODE_UNATTENDED_RETRY`)** : une seule requête en boucle 429 peut émettre 50+ événements. Hors périmètre de limiter l'émission en Phase 4 — si les volumes en production deviennent insoutenables, ajoutez un plafond par span avec un événement récapitulatif dans une PR ultérieure. Les `attempt` et `retry_total_delay_ms` agrégés sur la span LLM parente (D5) restent précis, quel que soit le plafond d'événements.

### D5 — Agrégation sur la span LLM parente : attributs scalaires uniquement (pas d'attributs de type map)

Les attributs de span OTel sont scalaires (`string | number | boolean | tableau de ceux-ci`). Les attributs de type map (comme `retry_count_by_status: {429:2, 503:1}`) nécessitent une sérialisation JSON et sont difficiles à interroger. À éviter.

| Attribut                  | Type   | Sémantique                                                                                                                               |
| ------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `attempt`                 | int    | Compteur monotone base 1 issu de `retryContext.attempt` (itération de cette tentative). Toujours renseigné (par défaut 1 en l'absence de contexte de nouvelle tentative) |
| `retry_total_delay_ms`    | int    | Somme des délais de backoff AVANT le début de cette tentative. Non défini pour les appels directs ; 0 pour la tentative 1 ; > 0 pour les tentatives suivantes |
| `ttft_ms`                 | int    | TTFT selon D1 ; non défini pour les requêtes non-streaming ou interrompues avant le premier morceau                                     |
| `request_setup_ms`        | int    | Selon D3                                                                                                                                |
| `sampling_ms`             | int    | Selon D6                                                                                                                                |
| `output_tokens_per_second`| double | Dérivé ; `output_tokens / (sampling_ms / 1000)` ; non défini quand `sampling_ms === 0`                                                  |

La distribution des codes de statut par tentative (par ex. « 2 des 3 tentatives étaient des 429 ») est interrogeable depuis les spans de pont de log des enregistrements `ApiRetryEvent`. Pas besoin de la dupliquer comme un attribut aplati sur le parent.

**Pourquoi `sampling_ms` et `output_tokens_per_second` sur la span** : dérivables mais fastidieux à calculer dans les requêtes backend lors de l'agrégation de nombreuses spans. Même rapport coût/bénéfice que `request_setup_ms` (D3).

### D6 — Activation de `recordApiRequestBreakdown()` pour 3 phases sur 4

Dans `endLLMRequestSpan` (ou le wrapper qui l'appelle), après avoir calculé TTFT/setup/sampling, émettre :

```ts
recordApiRequestBreakdown(config, model, [
  { phase: ApiRequestPhase.REQUEST_PREPARATION, durationMs: requestSetupMs },
  { phase: ApiRequestPhase.NETWORK_LATENCY, durationMs: ttftMs }, // ttftMs = latence réseau + génération du premier token
  { phase: ApiRequestPhase.RESPONSE_PROCESSING, durationMs: samplingMs },
]);
```

**Pourquoi ignorer `TOKEN_PROCESSING`** : qwen-code effectue le traitement des morceaux de flux en ligne (la consolidation a lieu dans le wrapper à `loggingContentGenerator.ts:644`) ; la phase de post-traitement après le flux dure <10 ms et n'est pas architecturalement distincte. La remplir avec une valeur sans signification pollue l'histogramme. Laisser la valeur d'énumération inutilisée est sans danger — `apiRequestBreakdownHistogram.record(value, {model, phase})` est simplement un histogramme avec `phase` comme étiquette ; les étiquettes manquantes sont simplement absentes des requêtes.

**Pourquoi ne pas redéfinir `NETWORK_LATENCY`** : le nom de la spécification est légèrement trompeur (c'est réseau + génération du premier token, pas une latence réseau pure), mais :

- L'énumération fait partie de `metrics.ts:330-334` qui est exportée depuis `index.ts:117` et testée.
- Les tableaux de bord backend peuvent déjà référencer ces noms de phase.
- Renommer ou ajouter une nouvelle phase serait un changement cassant pour une amélioration de précision marginale.

Documenter la sémantique dans le document de conception ; laisser l'énumération inchangée.

**Pourquoi sur le chemin de la span, pas en parallèle** : permet de maintenir `recordApiRequestBreakdown` colocalisé avec les écritures d'attributs de span — un seul point d'émission contrôlé (voir D7 pour l'idempotence), une seule invariant d'ordre.

### D7 — Idempotence de `endLLMRequestSpan` : enregistrement des métriques contrôlé par la garde de double fin existante

La Phase 1.5 (#4302) a établi que `endLLMRequestSpan` peut être appelée deux fois (collision chemin d'abandon + chemin d'erreur). La garde existante à `session-tracing.ts:~470` (`if (!activeSpans.has(...)) return;`) empêche un double `span.end()`. L'enregistrement des métriques de la Phase 4 (D6) **doit se situer à l'intérieur du même bloc contrôlé**, avant `span.end()` :

```ts
// session-tracing.ts — endLLMRequestSpan
const llmCtx = activeSpans.get(spanRef);
if (!llmCtx) return;            // déjà terminée — garde de double fin
activeSpans.delete(spanRef);    // revendiquer la fin

// ... calculer la durée, définir les attributs ...
if (metadata) {
  recordApiRequestBreakdown(config, llmCtx.attributes.model, [...]);   // NOUVEAU — contrôlé
  recordTokenUsageMetrics(...); // existant
}

span.end();
```

Cela garantit que la métrique est enregistrée **exactement une fois** par requête LLM, en correspondance avec le cycle de vie de la span.

**Pourquoi ne pas enregistrer dans `loggingContentGenerator`** : elle ne voit pas le chemin d'abandon. Enregistrer au niveau de la couche du cycle de vie de la span garantit que chaque requête LLM qui ouvre une span produit exactement un échantillon de décomposition, quel que soit le résultat (succès/échec/abandon).

### D8 — Émission double des conventions sémantiques GenAI (nom privé faisant autorité)

Chaque attribut de la Phase 4 qui correspond à un attribut de la semconv OTel GenAI est écrit deux fois sur la span :

| qwen-code privé (faisant autorité)          | GenAI semconv (couche de compatibilité)                    | Conversion d'unité | Statut de spec  |
| ------------------------------------------- | ---------------------------------------------------------- | ------------------ | --------------- |
| `ttft_ms` (ms, int)                         | `gen_ai.server.time_to_first_token` (s, double)            | `ttftMs / 1000`    | Expérimental    |
| `input_tokens` (int)                        | `gen_ai.usage.input_tokens` (int)                          | identique          | Stable          |
| `output_tokens` (int)                       | `gen_ai.usage.output_tokens` (int)                         | identique          | Stable          |
| `cached_input_tokens` (int) (si présent)    | `gen_ai.usage.cached_tokens` (int)                         | identique          | Expérimental    |
| `qwen-code.model` (string)                  | `gen_ai.request.model` (string)                            | identique          | Stable          |

**Noms d'attributs de tokens existants** sur la span LLM (définis dans `endLLMRequestSpan` avant la Phase 4) : qwen-code utilise déjà `input_tokens` et `output_tokens` nus. La Phase 4 ajoute les homologues `gen_ai.usage.*` pour correspondre au modèle de #4410. Les noms nus restent ; **ne pas renommer**.

Les champs sans équivalent GenAI semconv — `request_setup_ms`, `sampling_ms`, `retry_total_delay_ms`, `attempt`, `output_tokens_per_second` — sont émis uniquement sous l'espace de noms qwen-code.

**Pourquoi « privé faisant autorité, semconv comme compatibilité »** :

- Les tableaux de bord internes, les SLO, la sortie de debugLogger, qwen-logger RUM, les requêtes ARMS — tous référencent `ttft_ms` etc. Les traiter comme canonique évite une migration jour J.
- La semconv GenAI expérimentale peut renommer `gen_ai.server.time_to_first_token` avant d'atteindre Stable. Le cas échéant, nous mettons à jour l'émission semconv ; les noms qwen-code ne bougent pas.
- Les backends futurs conscients de la spec (vues AI Datadog, Honeycomb AI, tableaux de bord GenAI ARMS) récupèrent automatiquement les attributs `gen_ai.*` sans notre intervention.

**Pourquoi la conversion d'unité en double émission** (ms ↔ secondes) : GenAI semconv a choisi les secondes en double pour la latence ; qwen-code a choisi les ms en int (correspond à `duration_ms` déjà sur la span). Les deux représentations ont de la valeur ; la conversion est peu coûteuse.

## API d'aide (additive dans `session-tracing.ts`)

```ts
// session-tracing.ts — interface LLMRequestMetadata étendue (additive)
export interface LLMRequestMetadata {
  // ... champs existants : inputTokens, outputTokens, cachedInputTokens, success, error, ...

  /** Temps entre le début de la tentative réussie et le premier morceau de contenu visible par l'utilisateur (ms). Non défini pour les requêtes non-streaming ou interrompues avant le premier morceau. */
  ttftMs?: number;

  /** Temps entre l'entrée de generateContent et le début de la tentative réussie (ms). Inclut toutes les nouvelles tentatives échouées + le backoff. */
  requestSetupMs?: number;

  /** Numéro de la tentative finale (base 1). 1 = aucune nouvelle tentative. */
  attempt?: number;

  /** Somme de tous les délais de backoff avant la tentative réussie (ms). */
  retryTotalDelayMs?: number;
}

// Pas de nouvelles aides exportées — la Phase 4 réutilise startLLMRequestSpan / endLLMRequestSpan avec des métadonnées étendues.
```

```ts
// types.ts — nouvelle classe d'événement
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
  duration_ms: number;  // = retry_delay_ms, pilote la largeur de la span de pont LogToSpanProcessor

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

// Dans retryWithBackoff, là où logRetryAttempt est appelé aujourd'hui :
options.onRetry?.({ attempt, error, errorStatus, delayMs: actualDelay });
logRetryAttempt(attempt, error, errorStatus); // appel existant à debugLogger inchangé
```

## Câblage du cycle de vie

### Chemin streaming (le cas courant)

```ts
// loggingContentGenerator.ts:283 — generateContentStream
async generateContentStream(req, userPromptId): Promise<AsyncGenerator<GenerateContentResponse>> {
  const requestEntryTime = Date.now();
  let attemptStart = requestEntryTime;
  const attemptStartTimes: number[] = [attemptStart];
  let retryTotalDelayMs = 0;
  let finalAttempt = 1;

  // Utiliser startLLMRequestSpan existant (Phase 1)
  // Passer un callback onRetry à la couche de nouvelles tentatives utilisée :
  const onRetry: RetryAttemptInfo & { invoke: ... } = (info) => {
    finalAttempt = info.attempt + 1;        // nous allons commencer la tentative N+1
    retryTotalDelayMs += info.delayMs;
    attemptStart = Date.now() + info.delayMs; // approximatif; la réinitialisation réelle a lieu au début de la tentative suivante
    attemptStartTimes.push(attemptStart);
    // émettre ApiRetryEvent
    logApiRetry(this.config, new ApiRetryEvent({
      model: req.model,
      promptId: userPromptId,
      attemptNumber: info.attempt,
      error: info.error,
      statusCode: info.errorStatus,
      retryDelayMs: info.delayMs,
    }));
  };

  // le wrapper de flux détecte le premier morceau visible par l'utilisateur :
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

`generateContent` (`loggingContentGenerator.ts:212`) ne produit pas de morceaux de flux. TTFT est `undefined` ; `request_setup_ms` reste significatif (capture la surcharge des nouvelles tentatives). La métrique de décomposition enregistre 2 phases (REQUEST_PREPARATION + RESPONSE_PROCESSING où `RESPONSE_PROCESSING = duration_ms - request_setup_ms`), pas 3.

### Intégration de la couche de nouvelles tentatives (4 sites)

Chacun des 4 sites d'appel LLM à `retryWithBackoff` ajoute `onRetry` :

```ts
// client.ts:1540 (similaire à baseLlmClient.ts:193, 282, geminiChat.ts:1039)
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
    // également renvoyer à l'accumulateur local de nouvelles tentatives de LoggingContentGenerator
    // (quand il est dans la portée — pour les appelants qui ne passent pas par LoggingContentGenerator,
    // la span LLM reçoit toujours `attempt` et `retry_total_delay_ms` via le chemin
    // des métadonnées car endLLMRequestSpan est appelée au niveau de la couche LLM)
  },
});
```

L'appelant non-LLM (`channels/weixin/src/api.ts`) **n'enregistre pas `onRetry`** — aucun `ApiRetryEvent` n'est émis pour ses nouvelles tentatives, correspondant au comportement actuel.

## Sécurité concurrente — la garantie principale

L'instance de `LoggingContentGenerator` est partagée (une par `ContentGenerator`, `contentGenerator.ts:377`). Trois appels concurrents à `generateContentStream` (par exemple, 3 sous-agents qui se déploient via `coreToolScheduler.runConcurrently`) exécutent trois fermetures indépendantes de `generateContentStream` :

```
call_A: attemptStart_A, ttftMs_A, ... (fermeture)
call_B: attemptStart_B, ttftMs_B, ... (fermeture)
call_C: attemptStart_C, ttftMs_C, ... (fermeture)
```

Les variables locales par appel ne se chevauchent jamais. Les morceaux de flux sont détectés par rapport à `attemptStart` local de chaque appel. Les attributs de span sont définis au propre `endLLMRequestSpan` de chaque appel.

`AsyncLocalStorageContextManager` (enregistré par NodeSDK à `sdk.ts:273`) garantit déjà que le contexte OTel actif — et donc la span parent passée à `startLLMRequestSpan` — est correct par fibre.

## Fichiers à modifier

| Fichier                                                                                        | Modification                                                                                                                                                                                                                                   | LOC est |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `packages/core/src/telemetry/constants.ts`                                                     | Ajouter la constante `EVENT_API_RETRY`                                                                                                                                                                                                          | +2      |
| `packages/core/src/telemetry/types.ts`                                                         | Ajouter la classe `ApiRetryEvent` + membre d'union                                                                                                                                                                                              | +40     |
| `packages/core/src/telemetry/loggers.ts`                                                       | Ajouter la fonction `logApiRetry()`                                                                                                                                                                                                              | +20     |
| `packages/core/src/telemetry/qwen-logger/qwen-logger.ts`                                       | Ajouter `logApiRetryEvent()` pour la cohérence aval RUM                                                                                                                                                                                         | +20     |
| `packages/core/src/telemetry/session-tracing.ts`                                               | Étendre `LLMRequestMetadata` (ttftMs, requestSetupMs, attempt, retryTotalDelayMs) ; étendre `endLLMRequestSpan` pour définir les nouveaux attributs + métrique de décomposition + double émission gen_ai.\*                                     | +60     |
| `packages/core/src/telemetry/metrics.ts`                                                       | Câbler le site d'appel `recordApiRequestBreakdown` à l'intérieur de `endLLMRequestSpan` (aucune modification de l'enregistreur existant)                                                                                                         | 0       |
| `packages/core/src/utils/retry.ts`                                                             | Ajouter `onRetry?: (info: RetryAttemptInfo) => void` à RetryOptions ; exporter `RetryAttemptInfo` ; invoquer le callback sur le site existant de logRetryAttempt                                                                                | +25     |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts`                    | Capture TTFT : accumulateurs locaux à la méthode + helper `hasUserVisibleContent` + détection du premier morceau dans le wrapper de flux ; passer les nouvelles métadonnées à `endLLMRequestSpan`                                               | +80     |
| `packages/core/src/core/client.ts`                                                             | Câbler le callback `onRetry` sur le site d'appel `retryWithBackoff` (`client.ts:1540`)                                                                                                                                                          | +15     |
| `packages/core/src/core/baseLlmClient.ts`                                                      | Câbler le callback `onRetry` sur 2 sites d'appel `retryWithBackoff`                                                                                                                                                                             | +25     |
| `packages/core/src/core/geminiChat.ts`                                                         | Câbler le callback `onRetry` sur le site d'appel `retryWithBackoff` (`geminiChat.ts:1039`)                                                                                                                                                      | +15     |
| `packages/core/src/telemetry/session-tracing.test.ts`                                          | `endLLMRequestSpan` définit ttft_ms / request_setup_ms / attempt / retry_total_delay_ms / sampling_ms / output_tokens_per_second + double émission gen_ai + métrique de décomposition (chaque phase) + fin idempotente                         | +120    |
| `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.test.ts`               | `hasUserVisibleContent` (text / functionCall / inlineData / executableCode / thought / role-only / usage-only) ; les appels concurrents ne se contaminent pas ; TTFT non défini en cas d'abandon avant le premier morceau ; TTFT non défini en non-streaming | +100    |
| `packages/core/src/utils/retry.test.ts`                                                        | `onRetry` invoqué par tentative échouée avec les bons `attempt`, `delayMs`, `error`, `errorStatus` ; l'absence de `onRetry` est silencieuse (aucune télémétrie émise)                                                                             | +50     |
| `packages/core/src/telemetry/loggers.test.ts`                                                  | `logApiRetry` émet un LogRecord avec la charge utile attendue ; pont via LogToSpanProcessor vers une span imbriquée sous la span LLM active                                                                                                      | +40     |
Total : 14 fichiers, ~610 LOC. Plus gros que la Phase 2 (#4321) mais comparable à la Phase 3 (#4410) et justifié par l'étendue de l'intégration (4 sites de retry + plomberie de télémétrie + wrapper streaming).

Si la revue trouve que c'est trop volumineux : découper en **Phase 4a + 4b + 4c** :

- **4a** (~200 LOC) : capture du TTFT + extension de `LLMRequestMetadata` + double émission. Valeur autonome (visibilité du TTFT dès le premier jour).
- **4b** (~250 LOC) : callback `onRetry` + `ApiRetryEvent` + câblage des 4 appelants. **Indépendamment, une correction de bug** pour le trou de télémétrie `retryWithBackoff`.
- **4c** (~160 LOC) : activation de `recordApiRequestBreakdown` + attributs d'agrégation du span parent (`attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`). Dépend de 4a + 4b.

## Stratégie de test

| Test                                                                                                                                         | Ce qu'il prouve                        |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| `hasUserVisibleContent` renvoie true pour text/functionCall/inlineData/executableCode/thought                                                | Sémantique D1 sur tous les types de partie |
| `hasUserVisibleContent` renvoie false pour les chunks role-only et usage-only                                                               | Cas négatifs D1                        |
| streaming : TTFT mesuré du début de la tentative jusqu'au premier chunk visible utilisateur                                                  | Détection TTFT de bout en bout         |
| streaming : TTFT non défini si le stream est abandonné avant tout chunk visible utilisateur                                                  | Cas limite                             |
| streaming : TTFT calculé à partir du début de la tentative finale (pas de la première tentative)                                            | D3 — réinitialisation TTFT sur retry   |
| non-streaming : TTFT reste non défini                                                                                                        | Décision S3                            |
| Les appels simultanés à `generateContentStream` ne se contaminent pas mutuellement sur le TTFT                                               | Garantie locale à la méthode D2        |
| `endLLMRequestSpan` définit tous les attributs de Phase 4 (ttft_ms, request_setup_ms, sampling_ms, attempt, retry_total_delay_ms, output_tokens_per_second) | Présence des attributs                 |
| `endLLMRequestSpan` émet en double gen_ai.server.time_to_first_token + gen_ai.usage.\* + gen_ai.request.model                               | Double émission D8                     |
| `endLLMRequestSpan` enregistre la métrique de décomposition avec 3 phases pour le streaming, 2 pour le non-streaming                         | D6                                     |
| `endLLMRequestSpan` appelé deux fois : métrique enregistrée exactement une fois, attributs non réinitialisés                                 | Idempotence D7                         |
| `retryWithBackoff` avec `onRetry` : callback invoqué par tentative échouée avec les bons arguments                                          | Contrat du callback D4                 |
| `retryWithBackoff` sans `onRetry` : aucune télémétrie émise (silencieux pour les appelants non LLM)                                          | P2 — protection du périmètre channels/weixin |
| `client.ts` / `baseLlmClient.ts` / `geminiChat.ts` sites de retry émettent `ApiRetryEvent` en cas de retry                                  | Intégration de D4 sur 4 sites          |
| `ApiRetryEvent` LogRecord fait le pont via LogToSpanProcessor vers un span enfant sous le span LLM actif                                     | Exactitude de l'arbre de traces        |
| Le champ `attempt` du span LLM reflète correctement le numéro de tentative final en cas de retries                                          | Agrégation D5                          |
| Le champ `retry_total_delay_ms` du span LLM somme correctement les délais onRetry                                                           | Agrégation D5                          |
| `output_tokens_per_second` non défini quand `sampling_ms === 0` (pas de streaming)                                                          | Éviter division par zéro               |

## Cas limites

| Cas                                                                     | Gestion                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le stream est abandonné avant l'arrivée d'un chunk                      | `ttftMs = undefined`, `sampling_ms = undefined`, `output_tokens_per_second = undefined`. `attempt`, `request_setup_ms` toujours définis. `success = false`                                                              |
| Le stream est abandonné après le premier chunk                          | `ttftMs` défini ; `sampling_ms` = `duration_ms - ttftMs - request_setup_ms` ; reflète le temps de réponse partiel. `success = false`                                                                                    |
| Un retry réussit à la tentative 1 (pas de retry)                       | `attempt = 1`, `retry_total_delay_ms = 0`, aucun `ApiRetryEvent` émis, la métrique de décomposition enregistre `request_setup_ms` proche de 0                                                                           |
| Mode retry persistant sur 50+ tentatives                                | 50+ enregistrements `ApiRetryEvent` émis (cap différé hors scope) ; span LLM `attempt = 51`, `retry_total_delay_ms = somme de tous les délais`. L'opérateur voit une vue agrégée sur le span ; détails par tentative dans les spans log-bridge |
| Appelant `retryWithBackoff` non LLM (channels/weixin)                   | Aucun `onRetry` enregistré ; seul le `debugLogger.warn` existant se déclenche. Pas d'`ApiRetryEvent` ; pas de métrique de décomposition (l'appelant n'est pas un site LLM)                                              |
| `endLLMRequestSpan` appelé deux fois (race abort + erreur)              | La garde Phase 1.5 dans `activeSpans.delete()` retourne tôt lors du second appel ; `recordApiRequestBreakdown` est à l'intérieur de la garde, enregistré exactement une fois                                            |
| Un chunk `message_start` d'Anthropic arrive avant le contenu            | `hasUserVisibleContent` renvoie false (pas de parties avec text/functionCall/etc.) ; TTFT non déclenché jusqu'au chunk `content_block_delta` suivant                                                                    |
| Premier chunk OpenAI avec `delta.content` vide mais `role` seul         | `hasUserVisibleContent` renvoie false ; TTFT non déclenché jusqu'au premier chunk avec un delta non vide                                                                                                                |
| Réponse uniquement par tool-call (pas de texte)                         | Le premier chunk avec une Part `functionCall` déclenche le TTFT ; `output_tokens_per_second` calculé sur le nombre de tokens du tool-call                                                                                |
| Sous-agents simultanés (3 appels en vol)                                | Chaque appel possède ses propres `attemptStart`, `ttftMs`, `attemptStartTimes` dans sa fermeture. Chaque span d'appel reçoit ses propres métadonnées à `endLLMRequestSpan`. Pas d'entrelacement (D2)                   |
| Retries au niveau SDK dans openai-sdk (`maxRetries=3`)                  | Invisible pour la télémétrie qwen-code — se passe entièrement dans le SDK avant que retryWithBackoff ne voie la requête. `attempt` reflète uniquement les tentatives retryWithBackoff. Hors scope (voir Hors scope)       |
| Renommage de la spécification `gen_ai.server.time_to_first_token` avant qu'elle ne devienne Stable | Mise à jour d'un seul fichier : `session-tracing.ts:endLLMRequestSpan`. Le `ttft_ms` natif de qwen-code reste l'autorité — aucun impact en aval                                                                           |
| Requête LLM d'un sous-agent                                             | Le parent est le span du sous-agent (Phase 3). Les champs Phase 4 s'imbriquent correctement. Les agrégations groupées par `qwen-code.subagent.id` donnent les perfs LLM par sous-agent — design-doc-future, suivi facile |
| Modèle de raisonnement avec longs blocs de pensée                       | La première Part `thought` déclenche le TTFT ; `sampling_ms` inclut les phases de réflexion + réponse. Le split en métriques séparées est différé                                                                        |

## Rollback

La modification est additive au niveau OTel et métrique — chaque nouvel attribut est optionnel, chaque nouvel événement est une nouvelle classe. Les tableaux de bord existants qui ne filtrent pas sur les nouveaux champs continuent de fonctionner sans changement.

Modifications affectant le comportement :

- Le nouveau LogRecord `ApiRetryEvent` commence à circuler → le volume de logs augmente proportionnellement au taux de retry (typiquement <1% des requêtes effectuent un retry). Atténuer en échantillonnant le LogRecord au niveau SDK si nécessaire.
- La nouvelle métrique de décomposition `qwen-code.api.request.breakdown` commence à produire des séries temporelles → légère augmentation de cardinalité Prometheus (`{model, phase}` — bornée).
- L'attribut dérivé `output_tokens_per_second` peut sembler inhabituel sur les tableaux de bord filtrant "tous les attributs" — documenter.

Chemin de rollback : annuler la PR unique (ou chacune des PR 4a/4b/4c indépendamment). Tous les nouveaux champs utilisent des valeurs par défaut défensives (undefined / 0) et ne modifient pas la structure des spans.

## Séquencement

- **Après la Phase 3 (#4410, en relecture)** : pas une dépendance stricte. Les attributs de Phase 4 s'attachent aux spans `qwen-code.llm_request` indépendamment du fait qu'ils soient sous un parent `qwen-code.subagent` (Phase 3) ou `qwen-code.interaction` (Phase 1). Recommandation que la Phase 3 soit intégrée d'abord pour que l'agrégation par tentative sous les arbres de sous-agents fonctionne naturellement.
- **Indépendant de #4384** (`traceparent` + `X-Qwen-Code-Session-Id` propagation sortante). Ils touchent la couche HTTP ; la Phase 4 touche la couche stream/retry/métrique.
- **Indépendant du suivi `clearDetailedSpanState` de compression de chat** (suivi de #4097). Surface différente.

## Questions ouvertes

1. **Sémantique de déclenchement du callback `onRetry`** : invoqué **avant** le sommeil de backoff (proposition actuelle) ou **après** (quand la tentative suivante est sur le point de commencer) ? Avant est plus simple — le callback dispose immédiatement de toutes les infos ; après nécessiterait de capturer le délai qui vient de s'écouler séparément. La recommandation est pré-sommeil ; documenter dans le contrat du callback.
2. **Timing par tentative sur le span LLM** : faut-il ajouter un tableau `attempt_durations_ms: number[]` ? OTel supporte les attributs de type tableau de primitives. Utile pour diagnostiquer "quelle tentative parmi N était lente". Différer jusqu'à ce que les données de production montrent la demande — les spans log-bridge transportent déjà l'équivalent.
3. **Plafond d'émission pour le mode retry persistant** : à quel seuil `attempt > N` commencer l'échantillonnage ? `N = 5` puis 1 sur 10 ? `N = 10` puis résumé seulement ? Différer jusqu'à avoir des données de volume en production.
4. **Phase `TOKEN_PROCESSING`** : garder la valeur de l'énumération dormante ou la câbler à quelque chose (ex. temps de consolidation) ? Différer — attendre un cas d'usage réel.
5. **Agrégations LLM au niveau sous-agent** : suivi trivial une fois la Phase 4 déployée — sommer `ttft_ms`/`output_tokens`/`input_tokens` par arbre de sous-agent. Pas dans le périmètre de la Phase 4 mais le flux de données le permet.