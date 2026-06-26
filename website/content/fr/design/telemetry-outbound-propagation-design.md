# Télémétrie : Propagation du contexte de trace sortant et de l'en-tête d'ID de session

> Issue associé : [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Issue parent : [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 observabilité approfondie)
> PR préalable : #4367 (attributs de ressources — fusionnée le 2026-05-21, commit `64401e1`)
> Basé sur la branche main de qwen-code au 2026-05-21 + le code source de claude-code vérifié directement

## Historique des révisions

| Rév. | Date       | Déclencheur                                   | Résumé                                                                                                                                                                                                                                                                                                                      |
| ---- | ---------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | 2026-05-21 | Brouillon initial                             | Diffusion complète : toutes les requêtes LLM sortantes portent `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                                                    |
| R2   | 2026-05-22 | Revue wenshao R2/R3                           | Sécurité des limites : normalisation d'URL, correspondance de port, alignement des guillemets, try/catch pour staticCorrelationHeaders, suppression du fallback host:port                                                                                                                                                  |
| R3   | 2026-05-23 | LaZzyMan REQUEST_CHANGES                      | **Modification sémantique majeure** : la portée par défaut de `X-Qwen-Code-Session-Id` est réduite à la liste blanche des hôtes first-party (Alibaba/DashScope). Voir §11                                                                                                                                                 |
| R4   | 2026-05-25 | Suivi round-8 de LaZzyMan (confusion de périmètre) | **Périmètre de la PR considérablement réduit** : cette PR conserve uniquement le span HTTP client + la garde de boucle OTLP ; `traceparent` est désactivé par défaut (NoopTextMapPropagator) ; ajout du namespace de haut niveau `outboundCorrelation.*` pour les toggles liés à la sécurité ; l'ensemble de la machine `X-Qwen-Code-Session-Id` de R3 est **retiré de cette PR**, déplacé vers une PR de suivi indépendante. Voir §12 |

**Note importante** : lors de la lecture de §3.1 (objectifs) / §3.2 (non-objectifs) / §4.3 (conception Partie B) / §4.4 (impact sur le schéma de configuration) / §5 (liste des modifications de fichiers) / §9 (comparaison avec claude-code) / §10 (travaux futurs) / §11 (cadrage de la liste blanche d'hôtes R3), veuillez également consulter §12 — **la révision R4 invalide l'affirmation de R1-R3 selon laquelle cette PR implémente à la fois traceparent et l'en-tête d'ID de session** : cette PR ne concerne plus que l'observabilité de la télémétrie + un basculement indépendant du contexte de trace sortant, tout le travail sur les en-têtes de corrélation sortants (y compris la liste blanche d'hôtes de R3) est déplacé dans une PR de suivi indépendante. Le code de R3 n'est pas perdu, il pourra être réutilisé dans la PR de suivi.

## 1. Contexte

#4367 a résolu les **attributs et la cardinalité sur la télémétrie émise** (les opérateurs peuvent ajouter des étiquettes comme `user.id`/`tenant.id` aux spans/logs/metrics). Mais il n'a pas touché à une catégorie : **les en-têtes HTTP des requêtes LLM sortantes**. Aujourd'hui, les requêtes de qwen-code vers DashScope / OpenAI / Gemini / Anthropic **ne portent aucun en-tête de corrélation inter-processus** — ni le `traceparent` W3C, ni d'ID de session.

Conséquences :

1. Le contexte de trace est coupé à la frontière du processus qwen-code. Si le service de modèle (comme DashScope intégré à ARMS Tracing) dispose lui-même d'une instrumentation OTel, les spans qu'il produit sont indépendants de la trace de qwen-code, l'arbre de trace de bout en bout n'existe pas.
2. Aucun ID de session sur le fil. Pour associer les métriques/logs de qwen-code aux logs côté serveur, le backend doit faire correspondre hors ligne l'ID de trace ou le timestamp, ce qui est bien moins simple que de lire directement l'en-tête.
3. La trace locale manque d'un span HTTP côté client. Aujourd'hui, on ne peut voir que le temps total de `api.generateContent`, pas le TTFB réseau, la taille du corps de réponse, ni le nombre de tentatives.

## 2. État actuel

### 2.1 Seule `HttpInstrumentation` est activée

`packages/core/src/telemetry/sdk.ts:330` :

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` ne hook que les modules `http`/`https` natifs de Node, il **ne** couvre **pas** le chemin `globalThis.fetch` / undici.

### 2.2 Les deux SDK LLM utilisent fetch / undici

| SDK                                              | Implémentation HTTP                                                                                                                              | `HttpInstrumentation` couvre-t-il ? |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ soit undici). Preuve : `node_modules/openai/internal/shims.mjs` lève une erreur `'fetch' is not defined as a global` | ❌                                  |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Preuve : appel à `new Headers()` dans `dist/node/index.mjs`                                                | ❌                                  |
| `@anthropic-ai/sdk` (anthropicContentGenerator)   | Également basé sur fetch                                                                                                                         | ❌                                  |

### 2.3 Aucune propagation manuelle dans la base de code

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Vide. Aucun appel à `propagation.inject()`, aucune injection manuelle de traceparent.
### 2.4 État actuel des `defaultHeaders` pour chaque fournisseur

Famille OpenAI (utilisant le SDK `openai`) :

Tous les sous-fournisseurs OpenAI `extends DefaultOpenAICompatibleProvider`. **Le comportement de `buildHeaders` override se divise en deux catégories** (vérifié par grep audit) :

| Fournisseur | Fichier                | Comportement de buildHeaders()                                                                  | Impact                                           |
| ----------- | ---------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Classe de base | `default.ts:63-74`     | Fournit `{ 'User-Agent' }` + customHeaders                                                 | Modifier ici                                     |
| DashScope   | `dashscope.ts:110-124` | **`override` mais n'appelle pas `super`** — retourne un tout nouvel objet `User-Agent` + `X-DashScope-*` | **Doit être modifié séparément**, sinon l'en-tête de corrélation est perdu |
| OpenRouter  | `openrouter.ts:20-30`  | `override` mais **d'abord `const baseHeaders = super.buildHeaders()`**                          | Hérite automatiquement de la classe de base ✅ |
| DeepSeek    | `deepseek.ts`          | N'override pas `buildHeaders` (override seulement `buildRequest` / `getDefaultGenerationConfig`) | Hérite automatiquement de la classe de base ✅ |
| Minimax     | `minimax.ts`           | Comme DeepSeek                                                                             | Héritage automatique ✅                                    |
| Mistral     | `mistral.ts`           | Comme DeepSeek                                                                             | Héritage automatique ✅                                    |
| ModelScope  | `modelscope.ts`        | Comme DeepSeek                                                                             | Héritage automatique ✅                                    |

→ **La famille OpenAI nécessite la modification de 2 fichiers** : `default.ts` et `dashscope.ts`. Les 5 autres héritent automatiquement.

Google Gemini :

| Fournisseur | Fichier                          | Chemin d'injection d'en-tête                                                     |
| ----------- | -------------------------------- | -------------------------------------------------------------------------------- |
| Gemini      | `geminiContentGenerator.ts:59` | `new GoogleGenAI({ httpOptions: { headers } })` — support natif du SDK |

Anthropic :

| Fournisseur | Fichier                                                                                                 | Chemin d'injection d'en-tête |
| ----------- | -------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Anthropic   | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders` arg to `new Anthropic`) | `defaultHeaders`            |

**Au total, 4 points de construction SDK** nécessitent l'injection de l'en-tête session id. Tous les SDK prennent déjà en charge `defaultHeaders` / `httpOptions.headers`, aucun wrapper fetch n'est nécessaire.

### 2.5 Configuration existante du proxy et du fetch

`provider/default.ts:87-89` :

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` renvoie `{ fetch: customFetch }` ou similaire lorsque l'utilisateur configure un proxy, ce qui déclenche `setGlobalDispatcher(new ProxyAgent(...))` (voir `config.ts:1126-1128`). **Le mode dispatcher global d'undici est compatible avec `UndiciInstrumentation`** — il fonctionne via monkey-patch de `globalThis.fetch` et la diagnostics par canal d'undici, sans dépendre d'un dispatcher spécifique.

## 3. Objectifs / Non-objectifs

### 3.1 Objectifs

- Toutes les requêtes LLM sortantes avec en-tête W3C `traceparent` (propagateur `W3CTraceContextPropagator` par défaut du SDK OTel)
- ~~Toutes les~~ requêtes LLM sortantes avec en-tête `X-Qwen-Code-Session-Id` (espace de noms du même produit que claude-code) — **Révision R3** : par défaut, injecté uniquement vers l'hôte first-party (Alibaba/DashScope), pas vers les fournisseurs tiers ; voir §11
- Évite automatiquement le traçage du point d'exportation OTLP lui-même (boucle de rétroaction)
- Ajoute une span client précise pour les requêtes LLM (séparation du temps réseau vs temps modèle)
- Couvre 4 points de construction des fournisseurs : classe de base OpenAI, override DashScope, Gemini, Anthropic
- Requêtes en streaming / mode proxy / scénarios de reprise sans régression
- Cohérent avec la philosophie de conception de #4367 : via les options natives du SDK `defaultHeaders` – **Révision R1** : passage à un wrapper fetch en raison d'un problème de péremption ; **Révision R3** : ajout d'un filtre par hôte dans le wrapper fetch

### 3.2 Non-objectifs

- **En-tête `baggage`** : le SDK standard le supporte, mais qwen-code n'appelle pas `propagation.setBaggage()`, donc il n'est pas envoyé par défaut. Ce design ne l'active pas activement.
- **Héritage de la variable d'environnement `TRACEPARENT` dans les sous-processus** : claude-code injecte `TRACEPARENT` dans les sous-processus Bash/PowerShell. Le `BashTool` de qwen-code ne le fait pas. C'est un sous-problème indépendant.
- **Lecture de `TRACEPARENT` / `TRACESTATE` entrant** : le mode `-p` de claude-code et le SDK Agent lisent le traceparent de l'environnement pour continuer le traçage parent. Qwen-code ne le fait pas. Suivi indépendant.
- **`X-Qwen-Code-Request-Id`** : claude-code a `x-client-request-id`, utile pour la corrélation de tolérance aux dépassements de délai. Non traité dans cette itération, peut être un sous-problème ultérieur.
- **Propagateur personnalisé (B3 / Jaeger / X-Ray)** : par défaut, W3C couvre 99% des cas. Peut être une option de configuration future.
- ~~**Injection sélective par endpoint** : claude-code n'envoie pas traceparent vers les endpoints tiers (Bedrock / Vertex) ; qwen-code n'a pas besoin de distinction entre tiers, on envoie partout.~~ — **Révision R3** : Cette affirmation a été réfutée. La revue de LaZzyMan indique que qwen-code est un CLI open source se connectant à plusieurs fournisseurs tiers (OpenAI / Anthropic / OpenRouter / etc.), l'analogie first-party→first-party de claude-code ne s'applique pas ; l'en-tête session id doit être différencié par hôte. Voir §11. `traceparent` est toujours injecté partout selon la conception R1 (en-tête OTel standard, et l'ID de trace est un hash `sha256(sessionId)`), peut être ajouté comme follow-up indépendant avec un bouton par destination (`telemetry.propagateTraceContext`).

## 4. Conception

### 4.1 Structure globale

```
┌─ qwen-code process ────────────────────────────────────────────┐
│                                                                │
│  ┌─ session-tracing.ts ─┐                                     │
│  │ active span ctx      │                                     │
│  └──────┬───────────────┘                                     │
│         │                                                      │
│         ▼                                                      │
│  ┌─ propagation.inject() (called by undici instrumentation) ─┐│
│  │ writes `traceparent: 00-<traceId>-<spanId>-01` to headers ││
│  └─────────────────────────────────────────────────────────────┘│
│         │                                                      │
│  ┌──────▼──────────────────────────────────────────────────┐  │
│  │   fetch() — undici, instrumented                        │  │
│  │   creates HTTP client span                              │  │
│  │   injects traceparent into request headers              │  │
│  │   (skipped via ignoreRequestHook if endpoint is OTLP)   │  │
│  └─────────────────────────────────────────────────────────┘  │
│         │                                                      │
│         │   ┌─ defaultHeaders (per SDK constructor) ───────┐  │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... } │  │
│         └───┴────────────────────────────────────────────────┘ │
│             │                                                  │
└─────────────┼──────────────────────────────────────────────────┘
              │
              ▼ outbound HTTP
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (existing User-Agent, X-DashScope-*, etc.)
```
两条注入路径独立、互不依赖：

| Layer                    | 何时注入                              | 由谁注入                                                      |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------- |
| `traceparent`            | 每次 fetch 调用时                     | `UndiciInstrumentation` 自动（来自 OTel SDK 默认 propagator） |
| `X-Qwen-Code-Session-Id` | SDK 构造时一次性写入 `defaultHeaders` | 应用代码                                                      |

### 4.2 Partie A — `traceparent` via l'instrumentation undici

**Point de modification** : `packages/core/src/telemetry/sdk.ts`

```ts
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';

// ...
const otlpUrls = [
  config.getTelemetryOtlpEndpoint(),
  config.getTelemetryOtlpTracesEndpoint(),
  config.getTelemetryOtlpLogsEndpoint(),
  config.getTelemetryOtlpMetricsEndpoint(),
]
  .filter((u): u is string => !!u)
  .map((u) => u.replace(/\/$/, ''));

instrumentations: [
  new HttpInstrumentation(),
  new UndiciInstrumentation({
    ignoreRequestHook: (request) => {
      // request.origin = "https://collector:4318", request.path = "/v1/traces"
      const url = `${request.origin}${request.path}`;
      return otlpUrls.some((e) => url.startsWith(e));
    },
  }),
],
```

#### Pourquoi `ignoreRequestHook` est obligatoire

Le SDK OTel utilise lui-même fetch pour envoyer les données en POST au collecteur OTLP. Sans saut, UndiciInstrumentation créerait un span pour les requêtes de "remontée de données" → ce nouveau span serait à nouveau remonté → boucle infinie / bruit énorme. Tous les projets OTel sont tombés dans ce piège, et la documentation OTel recommande clairement ce hook.

#### Propagateur par défaut

OTel SDK `NodeSDK` sans `textMapPropagator` utilise par défaut `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])`. Aucun réglage explicite nécessaire.

#### Format de `traceparent`

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               version (fixe 00)                            flags
```

55 octets fixes, sans padding.

#### `tracestate` et `baggage`

- `tracestate` : transmis uniquement s'il vient de l'amont ; en injection propre, il n'est pas ajouté activement (comportement du SDK OTel).
- `baggage` : présent uniquement si `propagation.setBaggage(ctx, ...)` a été appelé. qwen-code ne l'appelle pas, donc aucun envoi.

### 4.3 Partie B — `X-Qwen-Code-Session-Id` via wrapper fetch (OpenAI / Anthropic) + en-têtes statiques (Gemini)

> **Révision R3** : La conception suivante décrit la résolution du problème de péremption du wrapper fetch et les 4 points d'intégration des fournisseurs — tout cela est conservé. Mais le wrapper intègre désormais une barrière de liste blanche d'hôtes, et `staticCorrelationHeaders` a également ajouté un paramètre `destinationUrl`. Le code d'implémentation le plus récent avec la barrière d'hôtes et la liste blanche par défaut se trouve au §11.

#### Critique : Problème de péremption et choix de solution

L'approche naïve (`defaultHeaders` intégrant directement `getSessionId()`) comporte un **vrai bug** :

1. `pipeline.ts:60` capture le session id au moment de la construction du client SDK (une seule fois) lors de `this.client = this.config.provider.buildClient()`
2. `config.ts:1850` la réinitialisation de session (déclenchée par `/clear` de l'utilisateur) met à jour `this.sessionId` et appelle `refreshSessionContext()`, mais **ne reconstruit pas contentGenerator**
3. Les appels LLM ultérieurs continuent avec l'ancien client → l'en-tête wire est toujours l'ancien session id → désynchronisation de corrélation côté backend

→ Il faut lire l'ID de session **par requête**, pas le capturer au moment de la construction.

#### Solution

```
                   ┌─ fetch pris en charge ─┐   Solution
OpenAI SDK          │     ✅                │   Wrapper fetch (lecture sessionId par requête) ✅
Anthropic SDK       │     ✅                │   Wrapper fetch ✅
@google/genai SDK   │     ❌                │   httpOptions.headers statiques + acceptation de la péremption
                   └────────────────────────┘
```

`@google/genai`'s `HttpOptions` interface ne prend pas en charge `fetch` (vérifié par `grep node_modules/@google/genai/dist/genai.d.ts` : seulement `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Donc Gemini utilise des en-têtes statiques, ce qui est **limitation connue** (§8.6).

#### Fonction auxiliaire centralisée (wrapper fetch par requête)

Nouveau fichier `packages/core/src/telemetry/llm-correlation-fetch.ts` :

```ts
import type { Config } from '../config/config.js';

/**
 * Wrapper une implémentation fetch pour que chaque requête sortante reçoive
 * les en-têtes de corrélation (`X-Qwen-Code-Session-Id`) à partir de l'ID
 * de session **courant**, et non pas la valeur capturée lors de la construction
 * du client SDK.
 *
 * Correspond au modèle de claude-code (src/services/api/client.ts:370-390 —
 * `buildFetch()`). L'injection par requête est nécessaire car `/clear`
 * réinitialise l'ID de session en cours de processus ; les clients SDK
 * (et leurs `defaultHeaders` statiques) ne sont PAS recréés lors de la
 * réinitialisation.
 *
 * L'appelant choisit le fetch de base — généralement
 * `runtimeOptions?.fetch ?? globalThis.fetch` pour préserver le fetch
 * compatible proxy lorsque ProxyAgent est utilisé.
 *
 * Si la télémétrie est désactivée, retourne baseFetch inchangé (aucun
 * en-tête de corrélation ajouté, conformément à la position de confidentialité
 * du §3.1).
 */
export function wrapFetchWithCorrelation(
  baseFetch: typeof fetch,
  config: Config,
): typeof fetch {
  return async function correlationFetch(input, init) {
    if (!config.getTelemetryEnabled()) {
      return baseFetch(input, init);
    }
    const sid = config.getSessionId();
    if (!sid) {
      // Défensif : une valeur d'en-tête vide est rejetée par certains
      // intergiciels HTTP. On évite donc d'envoyer `X-Qwen-Code-Session-Id: `.
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```
Companion helper pour les SDKs ne pouvant accepter que des en-têtes statiques (Gemini) :

```ts
/**
 * En-têtes de corrélation statiques. Capture l'identifiant de session au moment de l'appel —
 * **potentiellement obsolète** si le SDK hôte conserve ces en-têtes dans un emplacement
 * capturé à la construction (ex. `httpOptions.headers` de `@google/genai`).
 * Préférez `wrapFetchWithCorrelation` dès que le SDK expose un hook `fetch`.
 */
export function staticCorrelationHeaders(
  config: Config,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  return { 'X-Qwen-Code-Session-Id': config.getSessionId() };
}
```

#### Point d'intégration 1 : `provider/default.ts` (classe de base OpenAI)

Modification de `buildClient()` — composer le `runtimeOptions.fetch` existant (proxy) avec notre wrapper :

```ts
buildClient(): OpenAI {
  // ... existant ...
  const runtimeOptions = buildRuntimeFetchOptions('openai', this.cliConfig.getProxy());
  const baseFetch =
    (runtimeOptions as { fetch?: typeof fetch } | undefined)?.fetch
    ?? globalThis.fetch;
  return new OpenAI({
    apiKey,
    baseURL: baseUrl,
    timeout,
    maxRetries,
    defaultHeaders,
    ...(runtimeOptions || {}),
    // Après la spread, surcharge `fetch` pour que notre wrapper de corrélation
    // englobe le fetch tenant compte du proxy (ou globalThis.fetch sans proxy).
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` elle-même reste inchangée.

#### Point d'intégration 2 : `provider/dashscope.ts` (surcharge)

`buildClient()` utilise le même motif de composition (elle surcharge déjà `buildClient`). `buildHeaders()` ne change pas.

#### Point d'intégration 3 : `geminiContentGenerator/index.ts` (fabrique, PAS constructeur)

**Correction de la sur-déclaration du design précédent** : le constructeur de `geminiContentGenerator.ts` **n'a pas besoin** de changer de signature. La fonction fabrique dans `index.ts:48` reçoit déjà `gcConfig: Config` (la ligne 33 utilise déjà `gcConfig?.getUsageStatisticsEnabled()`), il suffit de fusionner les en-têtes statiques de corrélation dans `httpOptions.headers` au sein de la fabrique :

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... x-gemini-api-privileged-user-id existant ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← ajout
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) inchangé
```

Aucun changement de signature.

#### Point d'intégration 4 : `anthropicContentGenerator.ts`

Le SDK Anthropic accepte également un `fetch` personnalisé (utilise déjà `buildRuntimeFetchOptions`). Enveloppez le fetch dans le chemin de `buildClient` comme pour OpenAI default.ts. `buildHeaders` reste inchangé.

#### Chaîne de priorité

Inchangée : les `customHeaders` de l'utilisateur l'emportent toujours lors de la fusion de `defaultHeaders` (voir discussion §8.2 sur le spoofing). L'en-tête `X-Qwen-Code-Session-Id` injecté par le wrapper fetch est ajouté **après** la liste des en-têtes du SDK sur l'objet `Headers` final — avec la sémantique de `Headers.set()` de Node, cela équivaut à écraser tout en-tête précédent du même nom (y compris celui que l'utilisateur aurait mis dans `customHeaders`).

**Pour OpenAI/Anthropic (chemin wrapper fetch)** : corrélation > customHeaders > valeurs par défaut du SDK.
**Pour Gemini (chemin en-têtes statiques)** : customHeaders > corrélation > valeurs par défaut du SDK (ordre de spread existant).

La différence est que, sous le chemin wrapper fetch, le spoofing n'est plus possible (le wrapper fetch s'exécute après les en-têtes du SDK). C'est un **effet secondaire de la correction de bug**, pas un durcissement délibéré — mais plus sûr. À mentionner explicitement dans §8.2.

### 4.4 Impact sur le schéma de configuration

~~**Presque nul**. Ce design n'introduit pas de nouveau paramètre~~ — **Révision R3** : un nouveau paramètre `telemetry.sessionIdHeaderHosts: string[]` est introduit pour surcharger la liste blanche par défaut des hôtes propriétaires. L'élément de schéma a été ajouté dans `packages/cli/src/config/settingsSchema.ts`. La description et la syntaxe de surcharge (`["*"]` pour rétablir la diffusion / `[]` pour tout désactiver / tableau personnalisé) sont dans §11. La description ci-dessous ne s'applique qu'avant R3 :

- L'injection de `traceparent` est déclenchée par l'activation de la télémétrie (bascule existante)
- L'injection de `X-Qwen-Code-Session-Id` est également déclenchée par l'activation de la télémétrie
- L'URL OTLP de `ignoreRequestHook` est déjà lue à partir de la configuration existante

Paramètres futurs possibles (**hors périmètre**) :

- `telemetry.outboundCorrelationHeader` : nom d'en-tête personnalisé (par défaut `X-Qwen-Code-Session-Id`)
- `telemetry.outboundPropagationDisabled` : désactivation globale (si le service LLM est strict vis-à-vis des en-têtes inconnus)
- ~~bascule de périmètre d'en-tête par destination~~ — **R3 déjà livré**, voir §11

## 5. Liste des modifications de fichiers

| Fichier                                                                                        | Type de modification | Description                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                                   | Ajout de dépendance  | `@opentelemetry/instrumentation-undici`                                                                                                                                                                                                 |
| `packages/core/src/telemetry/sdk.ts`                                                           | Modification         | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                                                                                         |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                         | Nouveau fichier      | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (fallback Gemini)                                                                                                                                       |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                            | Modification         | Dans `buildClient()`, ajout de `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)` dans `new OpenAI({...})`                                                                                                                         |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`                          | Modification         | Identique (surcharge `buildClient`)                                                                                                                                                                                                    |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                       | Modification         | Fusion de `staticCorrelationHeaders(gcConfig)` dans `httpOptions.headers` dans la fonction fabrique (**l'appelant a déjà Config, zéro changement de signature** — correction de la sur-spécification précédente)                        |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`                | Modification         | Utilisation de `wrapFetchWithCorrelation` pour envelopper l'option `fetch` du SDK dans le chemin de `buildClient`                                                                                                                       |
**Audité explicitement mais ne nécessite aucune modification** (pour éviter que les relecteurs ne suspectent des chemins manquants) :

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`, utilise `DashScopeOpenAICompatibleProvider`, **hérite automatiquement des modifications de buildClient de dashscope.ts**. Tous les flux OAuth Qwen en bénéficient également.
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — mode wrapper, ne construit pas de client SDK (il enveloppe d'autres contentGenerator pour la journalisation de télémétrie), sans modification nécessaire.
- `packages/core/src/core/contentGenerator.ts` — point d'entrée factory, ne contient pas de client.
  | `packages/core/src/telemetry/sdk.test.ts` | Modifié | Ajout de l'enregistrement undici instrumentation + test ignoreRequestHook |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | Nouveau fichier | Tests unitaires du comportement telemetry-on/off + lecture du sessionId par requête (critique : après réinitialisation de session, le wrapped fetch lit le nouvel identifiant) |
  | Fichiers `*.test.ts` de chaque fournisseur | Modifié | Vérification que l'option `fetch` lors de la construction du SDK est une version wrapped (OpenAI/Anthropic) ; vérification que `httpOptions.headers` contient `X-Qwen-Code-Session-Id` pour la construction Gemini |
  | `docs/developers/development/telemetry.md` | Modifié | Ajout de la section "Propagation du contexte de trace et corrélation de session" |
  | `docs/design/telemetry-outbound-propagation-design.md` | Ce fichier | Document de conception |

## 6. Découpage en PR

Deux PR pour faciliter la relecture (peuvent être fusionnées si l’ampleur le permet) :

### PR 1 — Injection automatique de `traceparent` (structurelle)

- Ajout de la dépendance `@opentelemetry/instrumentation-undici`
- `sdk.ts` : ajout de `UndiciInstrumentation` + `ignoreRequestHook`
- Tests : enregistrement SDK, endpoint OTLP non tracé
- Fragment de documentation

**Risque** : Faible. Additif. Les spans client existantes sont un gain net, ne modifient pas la structure des spans actuelles.

### PR 2 — En-tête `X-Qwen-Code-Session-Id` (via fonction utilitaire)

- Nouveau fichier `llm-correlation-headers.ts`
- Intégration dans les 4 fournisseurs
- Tests : pour chaque fournisseur, vérifier que l’en-tête est présent ; absent lorsque télémétrie désactivée
- Fragment de documentation

**Risque** : Faible à moyen. Attention : l’extension de la signature du constructeur de `geminiContentGenerator` peut impacter les appelants.

### PR 3 (optionnelle) — Documentation + vérification E2E

- Compléter la section `telemetry.md`
- Ajouter un script de vérification E2E (réutilisant le modèle `/tmp/verify-telemetry-pr-4367.mjs`) : exécution réelle de fetch + capture des en-têtes

Peut être fusionnée dans la PR 2.

### Ordre préféré

Les PR 1 et 2 sont techniquement **indépendantes** — aucun code partagé. Mais **recommander la PR 1 en premier** :

- `traceparent` est un en-tête **standard** OTel, immédiatement reconnu par tout collecteur/backend OTel → bénéfice immédiat pour l’utilisateur
- `X-Qwen-Code-Session-Id` est un en-tête **personnalisé produit**, nécessite une configuration backend pour être utile → bénéfice décalé
- Si la revue de la PR 2 s’allonge, la PR 1 aura déjà établi le traçage inter-processus
- La PR 1 est additive et structurelle (faible risque), adaptée pour établir la confiance

## 7. Plan de test

### 7.1 Tests unitaires `sdk.ts`

- ✅ `UndiciInstrumentation` est présent dans les `instrumentations` de `NodeSDK`
- ✅ `ignoreRequestHook` retourne `true` pour `https://collector:4318/v1/traces`
- ✅ `ignoreRequestHook` retourne `false` pour `https://dashscope.aliyuncs.com/...`
- ✅ Correspondance correcte avec et sans slash final

### 7.2 Tests unitaires `llm-correlation-fetch.ts`

**`wrapFetchWithCorrelation`** :

| Scénario                                                     | Attendu                                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                            | wrapped fetch = baseFetch (aucun en-tête ajouté)                           |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"      | wrapped fetch émet `init.headers` contenant `X-Qwen-Code-Session-Id: abc-123` |
| `init.headers` contient déjà `X-Qwen-Code-Session-Id: spoof` | Le wrapper écrase par le vrai sessionId (le chemin fetch wrapper interdit le spoof, §8.1) |
| **Appel répété du wrapped fetch après réinitialisation de session** | **Lit le nouveau sessionId** (régression guard pour le correctif de péremption) |
| baseFetch rejette                                            | Le wrapper transmet le rejet sans l’avaler                                  |

**`staticCorrelationHeaders`** (chemin Gemini) :

| Scénario                                                    | Retour attendu                                                    |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                            | `{}`                                                              |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"      | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                         |
| sessionId contient des caractères unicode (`會話-1`)          | Retourné tel quel — le codage de la valeur HTTP est géré par le SDK |
| sessionId est une chaîne vide                                | `{ 'X-Qwen-Code-Session-Id': '' }` — invariant métier, non vérifié à ce niveau |

### 7.3 Tests d’intégration par fournisseur

Ajouter dans chaque test `buildHeaders()` / constructeur du fournisseur :

```ts
it('inclut X-Qwen-Code-Session-Id lorsque la télémétrie est activée', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('omet X-Qwen-Code-Session-Id lorsque la télémétrie est désactivée', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 Vérification E2E (tmux + serveur HTTP local)

⚠️ **Ne pas** mocker `globalThis.fetch` pour capturer les en-têtes : `UndiciInstrumentation` se branche via le canal de diagnostic d’undici ; le monkey-patching de `globalThis.fetch` pourrait contourner complètement l’instrumentation (selon l’ordre des patchs), rendant l’injection de `traceparent` impossible à tester. **La bonne approche est de lancer un serveur HTTP local**, de laisser le SDK envoyer de vraies requêtes, et le serveur enregistre les en-têtes reçus.
Écrire un script similaire à `/tmp/verify-telemetry-pr-4367.mjs` :

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` pour lancer un serveur local
2. Activer la télémétrie + fichier de sortie + pointer le `baseURL` du SDK OpenAI vers `http://127.0.0.1:<port>` (ou utiliser un fournisseur simulé pour que le SDK effectue un vrai fetch)
3. Déclencher un `client.chat.completions.create(...)` (avec une réponse simulée minimale analysable, sinon le SDK lève une erreur de parsing — le serveur local doit renvoyer une réponse OpenAI valide mais vide)
4. Vérifier que `capturedHeaders[0]` contient `traceparent: 00-...` et `X-Qwen-Code-Session-Id: <sessionId>`
5. Démarrer un autre collecteur OTLP factice sur un port différent, vérifier que les rapports OTLP qui lui sont envoyés **n’injectent pas** `traceparent` (valider `ignoreRequestHook`)
6. **En supplément : validation de l’obsolescence** — émettre la requête 1 → appeler `config.resetSession(...)` → émettre la requête 2 → vérifier que le `X-Qwen-Code-Session-Id` de la requête 2 est un nouvel identifiant de session (c’est le **test de régression clé pour le correctif #1**)

### 7.5 Protection contre les régressions

- Le fetch du streaming chat completion (avec `stream: true`) se ferme toujours normalement — `UndiciInstrumentation` a historiquement eu des bugs sur le cycle de vie des spans pour les réponses en streaming, **lors de l’implémentation, il faut exécuter un vrai completion en streaming de bout en bout pour vérifier que le span client se termine correctement, qu’aucun span ne fuit et que le flux n’est pas tronqué** ; on ne suppose pas qu’une version spécifique a corrigé cela.
- Mode proxy (`ProxyAgent`) activé simultanément avec l’instrumentation — `ignoreRequestHook` continue de correspondre par URL de point de terminaison, le proxy n’a pas d’impact.
- En cas de nouvelles tentatives (`maxRetries`), chaque nouvelle tentative obtient son propre span client, mais ils partagent tous le même parent `traceparent` (idéalement, les tentatives sont des child spans sous le même parent — ce comportement est dicté par le SDK, cette conception n’impose rien).

## 8. Cas limites / bordures

### 8.1 Comportement incohérent entre `customHeaders` et le spoofing

Le spoofing diffère **selon les chemins de fournisseur** (conséquence de la conception, pas un resserrement intentionnel) :

| Chemin du fournisseur                          | Spoofing possible ? | Raison                                                                                                                      |
| ---------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (chemin du wrapper fetch)   | ❌ Impossible       | Le wrapper fetch définit `headers.set('X-Qwen-Code-Session-Id', ...)` **après** la liste des en-têtes SDK, écrasant les `customHeaders` homonymes |
| Gemini (chemin des en-têtes statiques)         | ✅ Possible         | Ordre de fusion `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }` — `customHeaders` gagne en dernier            |

claude‑code utilise également le chemin du wrapper fetch, son comportement est identique à OpenAI/Anthropic (spoofing impossible). C’est un effet secondaire de la correction du bug d’obsolescence, pas un objectif initial.

**Il n’est pas prévu d’« aligner » les deux chemins** — le comportement de Gemini est dû à une limitation du SDK (pas de hook `fetch`), et dégrader OpenAI à un chemin statique n’aurait pas de sens.

Le spoofing de l’ID de session n’est pas une menace réelle (l’utilisateur contrôle le local et peut modifier le code source directement). Il faut mentionner cette différence dans la documentation pour éviter que les relecteurs ne remettent en cause la priorité de `customHeaders` lorsqu’ils constatent l’impossibilité de spoofing sur le chemin du wrapper fetch.

### 8.2 Deux cas particuliers de correspondance d’URL de collecteur OTLP

#### (a) Jeton d’authentification dans l’URL

Si l’endpoint OTLP de l’utilisateur ressemble à `https://collector/path?token=secret`, alors `ignoreRequestHook` avec `url.startsWith(e)` doit comparer la partie avant la chaîne de requête. Mais `request.path` donné par undici s’arrête au chemin (sans la requête), donc la comparaison de `e` ne prend également que la partie chemin. Par sécurité, supprimer la requête :

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) Faux positif théorique de `startsWith` traversant la frontière du nom d’hôte

Si `e = "http://collector"` (sans port), une URL réelle `http://collector-fake/v1/traces` serait faussement correspondante via `startsWith`.

**Probabilité de déclenchement réelle extrêmement faible** :

- Les endpoints OTLP ont presque toujours un port (4317 gRPC / 4318 HTTP), sous la forme `http://collector:4318` ; une extension comme `-fake` est impossible (après le port suit `/`)
- Un utilisateur configurant un endpoint sans port commet une erreur de configuration, le SDK utilise un fallback par défaut

**Pour durcir** : analyser l’origin et le chemin de l’URL séparément, ne pas utiliser `startsWith` nu :

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

Non fait dans cette itération — le surcoût est inutile, le faux positif ne se produit pas en pratique.

### 8.3 Mode Vertex AI pour Gemini

`@google/genai` prend en charge le mode `vertexai: true` (utilise les credentials GCP pour les endpoints Vertex au lieu des endpoints Generative AI). Les deux modes utilisent `fetch`, donc l’instrumentation couvre les deux. `httpOptions.headers` fonctionne dans les deux modes.

### 8.4 Logique existante de `defaultHeaders` dans le SDK Anthropic

`anthropicContentGenerator.ts:177` appelle déjà `buildHeaders()` puis transmet à `new Anthropic({ defaultHeaders })`. Mais l’obsolescence s’applique aussi — cette conception utilise désormais le chemin du wrapper `fetch` (comme OpenAI).

### 8.5 En-têtes de traînée entre le SDK et le fetch

Le SDK `openai` peut utiliser `Transfer-Encoding: chunked` et des en-têtes de traînée lors du streaming. Ceux-ci n’affectent pas l’injection de `traceparent` / `X-Qwen-Code-Session-Id` au moment de la requête — ce sont des en-têtes de requête écrits une seule fois à l’envoi.

### 8.6 ⚠️ Limite connue : l’ID de session de Gemini devient obsolète après `/clear`

Étant donné que le SDK `@google/genai` ne prend pas en charge le hook `fetch` (l’interface `HttpOptions` n’offre que `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`), le fournisseur Gemini emprunte le chemin statique des en-têtes `httpOptions.headers` — l’ID de session est capturé à la construction du SDK, **il n’est pas rafraîchi après un `/clear` déclenchant une réinitialisation de session**.

**Impact réel** :

- L’utilisateur lance qwen‑code → `/clear` → utilise le modèle Gemini → le `X-Qwen-Code-Session-Id` sur le fil est l’ancien ID de session
- La corrélation backend est décalée (l’ID de trace et les logs sont déjà passés à la nouvelle session, mais l’en-tête du fil est en retard)

**Pourquoi ne pas corriger** (dans cette itération) :

- Les chemins OpenAI / Anthropic **n’ont pas ce bug** (le chemin du wrapper fetch lit l’ID de session par requête)
- Les options de correction pour Gemini sont plusieurs, toutes hors scope de cette itération (voir ci-dessous)

**Options de correction future** (par ordre de recommandation) :

| Option                                          | Description                                                                                 | Coût                                                                                      |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **A. Invalidation paresseuse** ★ Recommandée     | Lors de la réinitialisation de session, marquer uniquement `contentGenerator` comme sale, recréer paresseusement lors du prochain appel LLM | Faible : ~10 lignes ajoutées dans `resetSession` + point d’entrée d’appel LLM ; API synchrone, sans intrusion |
| B. Recréation immédiate                         | Lors de la réinitialisation de session, `await createContentGenerator(...)` immédiatement, nécessite que `resetSession` devienne asynchrone | Moyen : cascade de modifications d’API                     |
| C. Objet Proxy pour les en-têtes                | Envelopper `httpOptions.headers` avec un Proxy interceptant les getters                     | Risqué : on ne sait pas si `@google/genai` relit les en-têtes par requête en interne, comportement possiblement silencieusement cassé |
| D. Pousser l’option `fetch` en amont dans `@google/genai` | Déposer une PR sur google‑deepmind/generative‑ai‑js                            | Long terme ; non contrôlable                                                                |
**Documentation à expliquer devant l'utilisateur** : lors de l'utilisation du fournisseur Gemini, si un appel LLM a lieu immédiatement après `/clear`, l'ID de session sur le wire est obsolète à ce moment. On peut le corriger indirectement via la corrélation de trace (les spans/logs ont déjà le nouveau `session.id`).

Un sous-issue de suivi doit être ouvert séparément pour l’option A.

## 9. Comparaison avec claude-code

| Dimension                            | claude-code                                                                                                                                                                                      | qwen-code (présente conception)                                                                                                                                                                                                                                | Décision                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nom de l’en-tête Session id          | `X-Claude-Code-Session-Id` (préfixe produit)                                                                                                                                                    | `X-Qwen-Code-Session-Id` (préfixe produit)                                                                                                                                                                                                                    | ✅ Même stratégie d’espace de noms                                                                                                                                   |
| Mécanisme d’injection du Session id  | SDK `defaultHeaders` (`client.ts:108`) + wrapper `buildFetch()` personnalisé (`client.ts:370-390`, injection `randomUUID()` par requête dans `x-client-request-id`)                              | OpenAI/Anthropic via wrapper fetch (lecture du session id par requête, évite le décalage `/clear`) ; Gemini via en-têtes `httpOptions.headers` statiques (limitation SDK)                                                                                     | Aligné sur le modèle wrapper fetch de claude-code. claude-code utilise aussi un wrapper fetch pour ajouter `x-client-request-id` par requête.                          |
| Persistance du Session id            | Pas de réinitialisation de session de type `/clear` chez claude-code ; session = processus                                                                                                      | Réinitialisation `/clear` → le chemin wrapper fetch suit automatiquement ; le chemin en-têtes statiques devient obsolète (§8.6)                                                                                                                               | Complexité propre à qwen-code                                                                                                                                        |
| Encodage du Session id               | En-tête HTTP (pas un baggage)                                                                                                                                                                   | En-tête HTTP                                                                                                                                                                                                                                                    | ✅ Idem — compatible backend                                                                                                                                         |
| Injection de `traceparent`           | Source fermée ; les docs publics mentionnent son existence ; le dépôt open source ne contient pas de référence à `propagation.inject` / `UndiciInstrumentation`                                 | `@opentelemetry/instrumentation-undici` automatique                                                                                                                                                                                                             | L’implémentation de claude-code est invisible. Nous suivons la voie recommandée par OTel, plus légère.                                                                 |
| Portée d’envoi de `traceparent`      | Uniquement API Anthropic propriétaire ; pas envoyé vers Bedrock/Vertex/Foundry                                                                                                                   | Envoyé vers toutes les requêtes fetch sortantes (norme W3C ; le trace id est `sha256(sessionId)`). **Révision R3** : l’en-tête session id est injecté uniquement dans la liste blanche propriétaire (Alibaba/DashScope), pas envoyé aux tiers par défaut. Voir §11 | Après R3, l’en-tête session de qwen-code a la même sémantique first-party-only que claude-code ; `traceparent` nécessite toujours un basculement par destination (follow-up). |
| `x-client-request-id` (aléatoire)    | Oui, automatique                                                                                                                                                                                 | Pas encore implémenté (un sous-issue de suivi distinct a plus de valeur)                                                                                                                                                                                       | Contrôle du périmètre                                                                                                                                                |
| Variable d’environnement `TRACEPARENT` dans les sous-processus | La documentation reconnaît son existence (implémentation fermée)                                                                                                                              | Pas implémenté (suivi distinct)                                                                                                                                                                                                                                | Contrôle du périmètre                                                                                                                                                |
| Lecture de `TRACEPARENT` entrant     | La documentation reconnaît son existence (mode `-p` / Agent SDK)                                                                                                                                | Pas implémenté (suivi distinct)                                                                                                                                                                                                                                | Contrôle du périmètre                                                                                                                                                |
**Annotations `verified` vs `documented`** :

| affirmation                                                                                                                                       | statut de vérification                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders`                                                                                                   | ✅ Lu dans l'open source `src/services/api/client.ts:108`                                                                                                   |
| `x-client-request-id` via le wrapper fetch                                                                                                        | ✅ Lu dans l'open source `src/services/api/client.ts:370-390`                                                                                               |
| Injection de `traceparent`                                                                                                                        | ⚠️ Uniquement mentionné dans docs.claude.com/docs/en/monitoring-usage.md ; `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` retourne vide dans le dépôt open source |

## 10. Travaux futurs

Sous le ticket #3731 (P3), cette conception **n'inclut pas** mais est liée à :

- **`X-Qwen-Code-Request-Id`** : UUID aléatoire par requête (équivalent claude-code : `x-client-request-id`). Utile pour la corrélation des erreurs de timeout — le serveur peut ne pas encore avoir assigné d'ID de requête lors d'un timeout, l'ID envoyé par le client est le seul moyen de corrélation. Après la révision R3, cette suggestion devient plus pertinente : un UUID par requête ne présente pas de risque de « profilage inter-requêtes » et peut servir d'« en-tête de support/débogage envoyé à tous les fournisseurs LLM ».
- **Portée par destination du `traceparent` activable** — La révision R3 ne traite que la portée de l'en-tête d'ID de session ; `traceparent` est toujours injecté dans toutes les requêtes fetch sortantes. On pourrait ajouter `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'`, en utilisant la même liste blanche que la section §11 pour déterminer le comportement.
- **Invalidation paresseuse de l'obsolescence de l'ID de session pour Gemini (option A §8.6)** : lors d'un `/clear`, marquer le `contentGenerator` comme sale, puis recréer paresseusement lors du prochain appel LLM. Permet au chemin Gemini de bénéficier de la mise à jour en temps réel du wrapper fetch.
- **Variable d'environnement `TRACEPARENT` pour les processus fils** : injecter l'environnement lors de l'exécution d'un processus fils par `BashTool`, pour que les outils externes puissent continuer la trace. Nécessite une étude séparée du cycle de vie d'exécution des outils.
- **`TRACEPARENT` entrant** : lire la variable d'environnement au démarrage en mode `--prompt`, pour permettre à un orchestrateur CI/externe de connecter qwen-code à une trace plus large.
- **Nom configurable de `correlationHeader`** : permettre aux équipes ops d'entreprise de personnaliser l'en-tête (par défaut `X-Qwen-Code-Session-Id`).
- **Stratégie de propagation `baggage`** : décider si l'on définit activement des `baggage` pour faire transiter `user.id` / `tenant.id` etc. vers l'aval. Non traité dans cette itération, en attente de besoin clair.

## 11. Révision R3 — Portée par liste blanche d'hôtes pour `X-Qwen-Code-Session-Id`

> Déclencheur : [REVIEW de LaZzyMan sur la PR #4390 avec REQUEST_CHANGES](https://github.com/QwenLM/qwen-code/pull/4390)
> Commit de mise en œuvre : `1c8528a56` (implémentation cœur) + `cb162e716` (fail-closed sur baseUrl Vertex + tolérance `["*"]` trim)

### 11.1 Déclencheur et justification

La conception R1 injectait `X-Qwen-Code-Session-Id` dans **toutes** les requêtes LLM sortantes, contrôlée uniquement par `telemetry.enabled`. La revue de LaZzyMan a identifié trois problèmes progressifs :

1. **Étiquetage erroné** : le préfixe `feat(telemetry):` + le chemin `telemetry/` + la condition `getTelemetryEnabled()` amènent l'utilisateur à comprendre raisonnablement « mes données de télémétrie partent vers mon collecteur ». Mais `X-Qwen-Code-Session-Id` n'arrive jamais au backend OTLP ; il voyage dans les requêtes LLM vers DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral. Deux décisions de sortie de données différentes liées à un seul interrupteur.

2. **L'analogie avec claude-code ne tient pas** : dans R1 §9, la stratégie d'espace de nommage et le mode wrapper fetch étaient « alignés » sur claude-code. Mais claude-code est un fournisseur unique (Anthropic) → Anthropic (mono-fournisseur, mono-direction), tandis que qwen-code est un CLI open source → plusieurs fournisseurs tiers. « Un UUID stable inter-requêtes diffusé à tous les tiers » est une question à laquelle R1 n'a pas répondu frontalement.

3. **traceparent est un autre canal du même identifiant** : l'ID de trace = `sha256(sessionId).slice(0, 32)`, pour le destinataire c'est toujours un identifiant de session stable (haché donc irréversible, mais identique pour une même session).

LaZzyMan a évalué la sévérité : ID de session : `élevé` / traceparent : `moyen`.

### 11.2 Résumé de la solution

**Rétrécir la portée par défaut aux hôtes first-party**. Ajout d'un paramètre :

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                                 // restaure le comportement R1 (diffusion large)
  "sessionIdHeaderHosts": []                                     // désactive totalement l'en-tête
  "sessionIdHeaderHosts": ["api.mycompany.com",
                           "*.gateway.mycompany.internal"]
}
```

Valeur par défaut (provenant de `packages/core/src/telemetry/trusted-llm-hosts.ts:DEFAULT_SESSION_ID_HEADER_HOSTS`) :

```
dashscope.aliyuncs.com
dashscope-intl.aliyuncs.com
*.dashscope.aliyuncs.com
*.dashscope-intl.aliyuncs.com
*.alibaba-inc.com
*.aliyun-inc.com
```

La sémantique de cet ensemble est : « fournisseur LLM, backend ARMS Tracing, même entité juridique que la distribution qwen-code » — c'est-à-dire l'équivalent pour qwen-code de la relation mono-fournisseur / mono-direction de claude-code. Les fournisseurs tiers (OpenAI / Anthropic / OpenRouter / etc.) ne reçoivent **pas** l'en-tête par défaut.

### 11.3 Syntaxe des motifs (intentionnellement minimale)

`matchesTrustedHost(hostname, patterns)` ne supporte que deux motifs, alignée sur `DashScopeOpenAICompatibleProvider.isDashScopeProvider` :

- nom d'hôte nu → correspondance exacte (insensible à la casse)
- `*.suffix` → correspond au `suffix` lui-même **ET** à tout sous-domaine ; ancré par un point pour refuser les attaques de typosquattage comme `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld`

Pas d'expression rationnelle, pas de globbing sensible au port/schéma — les chaînes dans les paramètres ont la sémantique que leur texte laisse supposer.

### 11.4 Différences d'implémentation par rapport à R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

Le wrapper R1 n'avait que deux conditions : télémétrie activée + ID de session. R3 insère une troisième condition entre les deux :

```ts
const trustedHosts =
  config.getTelemetrySessionIdHeaderHosts?.() ??
  DEFAULT_SESSION_ID_HEADER_HOSTS;
const broadcastAll = trustedHosts.some((p) => p.trim() === '*');

return async function correlationFetch(input, init) {
  if (!config.getTelemetryEnabled()) return baseFetch(input, init);
  if (!broadcastAll) {
    const host = extractRequestHost(input);
    if (!host || !matchesTrustedHost(host, trustedHosts)) {
      return baseFetch(input, init); // porte de l'hôte
    }
  }
  const sid = config.getSessionId();
  if (!sid) return baseFetch(input, init);
  // ... injection d'en-tête
};
```
`trustedHosts` est capturé une seule fois lors du `wrap` (contrairement à la session id, lue en temps réel à chaque requête). Modifier `telemetry.sessionIdHeaderHosts` en cours d’exécution nécessite la reconstruction du `contentGenerator` pour être pris en compte. Les écritures comme `[" * "]` avec des espaces sont ramenées en mode broadcast via `.trim()`, évitant les dégradations silencieuses dues à des erreurs de frappe dans `settings.json`.

#### `staticCorrelationHeaders` (Gemini)

Ajouter un paramètre `destinationUrl?: string` :

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: destination inconnue → on n’envoie pas
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Intégration du factory Gemini

Le SDK Gemini possède deux endpoints par défaut invisibles (`generativelanguage.googleapis.com` et `{region}-aiplatform.googleapis.com`, déterminé par `vertexai`). Le factory ne peut pas les reconstituer exactement. R3 choisit de passer `undefined` quand `config.baseUrl` n’est pas défini : le helper fait un fail-closed → pas d’en-tête. Les opérateurs qui souhaitent la corrélation doivent explicitement définir `baseUrl` (la même entrée que le SDK utilise pour résoudre la destination). Ce changement évite que le faux Vertex destination soit autorisé par erreur dans la liste d’adresses autorisées.

### 11.5 Nouveaux fichiers / Nouveau code

| Fichier                                                                                              | Description                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (NOUVEAU)                                         | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                                                                                  |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (NOUVEAU)                                    | Tests unitaires, incluant vecteurs d’attaque suffixe TLD, IPv6 fail-closed, extraction port/userinfo/requête                                                   |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                               | Ajout de la gate sur les hôtes ; `staticCorrelationHeaders` ajoute le paramètre `destinationUrl`                                                                 |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                          | 8 cas pour la gate sur les hôtes ; `mockConfig` utilise `'hosts' in opts` pour distinguer "allowlist par défaut" de "broadcast"                                  |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`)                                 | Transmet `sessionIdHeaderHosts`                                                                                                                                  |
| `packages/core/src/config/config.ts`                                                                 | `TelemetrySettings.sessionIdHeaderHosts` + getter `getTelemetrySessionIdHeaderHosts()`                                                                           |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                            | Passe `config.baseUrl` à l’helper ; fail-closed si `undefined`                                                                                                  |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`                                       | Réécrit les tests de télémétrie Gemini pour correspondre à la nouvelle sémantique fail-closed                                                                    |
| `packages/cli/src/config/settingsSchema.ts`                                                          | Point d’entrée du schéma JSON `sessionIdHeaderHosts`                                                                                                            |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                         | Régénéré par `npm run generate:settings-schema`                                                                                                                  |
| `docs/developers/development/telemetry.md`                                                           | Réécriture du paragraphe "En-tête de corrélation de session" + portée par défaut + syntaxe de surcharge                                                          |

### 11.6 Réponses aux arguments de LazzyMan

| Argument de LazzyMan                   | Réponse de R3                                                                                                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ① Mauvais alignement du label télémétrie | **Résolu** : dans le cas DashScope, l’en‑tête session id est effectivement envoyé au backend ARMS Tracing (même entité juridique), la sémantique `telemetry.enabled` est donc cohérente.          |
| ② Broadcast d’un identifiant stable cross‑vendeur | **Résolu** : la liste d’adresses autorisées par défaut ne contient que les hôtes first‑party d’Alibaba ; le broadcast devient opt‑in (`["*"]`).                                                 |
| ③ `traceparent` comme autre canal pour la même empreinte | **Conservé provisoirement** : `traceparent` reste injecté comme dans R1. Justification : norme W3C, trace id est un hash SHA‑256, la continuité intra‑vendeur est un cas d’usage central de W3C. L’interrupteur par destination pour `traceparent` est reporté dans les travaux futurs §10. |

### 11.7 Problèmes connus et suivi

- **Portée de `traceparent`** — voir point ③ ci‑dessus, reporté en §10.
- **UUID aléatoire par requête** (`X-Qwen-Code-Request-Id`) — alternative proposée par LazzyMan, reportée en §10.
- **Invalidation paresseuse de Gemini** (§8.6 option A) — découplé de R3, sous‑tâche indépendante.
- **Support IPv6 de `matchesTrustedHost`** — actuellement une destination IPv6 n’est jamais dans la liste autorisée (`URL.hostname` renvoie `[::1]` avec crochets, pas de forme correspondante dans les motifs). Cela suffit pour le cas des endpoints first‑party nommés. Si un jour l’IP brute doit être autorisée, on étendra.

## 12. R4 — Révision : Démêlement de la contamination de portée

> Déclencheur : [Relecture de suivi ronde 8 de LaZzyMan sur PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Mise en œuvre : ce PR le restreint ; l’ensemble session‑id mis en place par R3 est déplacé dans un PR de suivi indépendant

### 12.1 Déclencheur et justification

R3 avait résolu l’inquiétude de la première relecture de LaZzyMan concernant la « diffusion d’une empreinte stable à un fournisseur tiers » (gravité haute). Mais lors de la relecture ronde 8, il a élevé le niveau à une objection architecturale plus profonde :

> "Telemetry n’est pas un conteneur pour des fonctionnalités adjacentes. La propagation inter‑processus de `traceparent` et l’injection de l’en‑tête `X-Qwen-Code-Session-Id` **ne sont pas de la télémétrie**. Ce sont des travaux d’identité / de corrélation sortante qui utilisent certaines API OTel en interne comme détail d’implémentation."
Son argument central :

- L’espace de noms **`telemetry`** sous-entend que le destinataire = le collecteur OTLP de l’utilisateur
- Mais les destinataires de `traceparent` et de `X-Qwen-Code-Session-Id` = **le fournisseur LLM tiers**
- Deux types de destinataires différents devraient avoir deux arbres de décision de consentement distincts
- Même si le comportement par défaut est sûr (R3 est déjà implémenté), placer un comportement de niveau wire sous `telemetry.*` **crée un mauvais précédent** : de futures PR telemetry pourraient continuer à faire passer des comportements wire vers des tiers
- « Si nous acceptons ce principe, la séparation est mécanique. Sinon, cette PR n’est pas le bon endroit pour en débattre, car les correctifs techniques sont déjà en place. »

### 12.2 Résumé de la solution (« Plan C » – division hybride)

Après plusieurs discussions internes (y compris la proposition alternative de yiliang d’un modèle d’en-tête personnalisé, finalement jugée incapable de transporter des valeurs dynamiques à l’exécution), la décision est prise d’adopter **le Plan C** :

**Ce qui reste dans cette PR** :

- Enregistrement de `UndiciInstrumentation` (produit des spans HTTP client → collecteur OTLP de l’utilisateur)
- Garde-fou de boucle de rétroaction OTLP (effet secondaire nécessaire du point précédent)
- **Installation par défaut de `NoopTextMapPropagator`** → `propagation.inject()` est une opération nulle → **plus de `traceparent`** sur les `fetch` sortants
- **Nouveau réglage `outboundCorrelation.propagateTraceContext: bool` (par défaut false)** en tant que réglage de premier niveau dans un espace de noms indépendant ; si true, installe le composite propagateur W3C par défaut
- **Tout le code `R3 session-id`** (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / réglage `telemetry.sessionIdHeaderHosts` / 4 points d’intégration fournisseur / tous les tests associés) **entièrement supprimé**

**Déplacé vers une PR de suivi** :

- Tout le mécanisme de l’en-tête `X-Qwen-Code-Session-Id` (réutilisation de l’implémentation R3)
- Entre dans le nouvel espace de noms `outboundCorrelation.*` (la clé de réglage exacte reste à définir, mais ne **s’appellera pas** `telemetry.*`)
- La PR de suivi apportera : une section sur le modèle de menace, une revue indépendante, une documentation marquée comme sensible à la sécurité
- `X-Qwen-Code-Request-Id` UUID par requête (la conception alternative proposée par LazzyMan lors du cycle R3) est également envisagée dans cette PR de suivi

### 12.3 Correspondance avec les arguments R1/R3

| Argument R1/R3                                          | Statut après R4                                                                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| §3.1 « Toute requête LLM sortante porte un traceparent »  | ❌ **Désactivé par défaut dans R4** ; nécessite `outboundCorrelation.propagateTraceContext: true` pour être activé        |
| §3.1 « Toute requête LLM sortante porte `X-Qwen-Code-Session-Id` » | ❌ **Entièrement retiré de cette PR dans R4**, déplacé vers une PR de suivi                         |
| §4.3 Le wrapper fetch injecte l’ID de session            | ❌ Le code entier n’est pas dans cette PR ; réutilisé dans la PR de suivi                                                |
| §11 Liste blanche d’hôtes (conception R3)                | ❌ Idem ; migré en bloc vers la PR de suivi                                                                               |
| §4.4 N’introduire aucun nouveau réglage                  | ❌ **Cette PR ajoute `outboundCorrelation.propagateTraceContext`** un booléen ; les réglages liés à l’ID de session sont dans la PR de suivi |
| §10 Travaux futurs « `X-Qwen-Code-Request-Id` »           | ✅ Toujours un travail futur ; conçu avec la PR de suivi de l’ID de session                                               |

### 12.4 Intention de conception du nouvel espace de noms

L’espace de noms de premier niveau `outboundCorrelation.*` n’a qu’un seul booléen (`propagateTraceContext`) dans cette PR, ce qui peut sembler sur-structuré. Mais c’est **un choix délibéré** :

- **Établir l’espace de noms comme un engagement** : permettre aux futurs ID de session, ID de requête, etc. d’entrer naturellement dans cet espace de noms
- **Marqué comme sensible à la sécurité** : la description dans `settingsSchema.ts` écrit explicitement « SECURITY-RELEVANT », documenté comme « réglage de sécurité » plutôt que « réglage d’observabilité »
- **Tous les paramètres par défaut sont désactivés** : conforme au principe de LazzyMan selon lequel « un client open source ne doit pas envoyer d’ID stables à des tiers sans consentement explicite »
- **Découplé de `telemetry.*`** : l’utilisateur lisant settings.json voit `outboundCorrelation.*` et reconnaît immédiatement qu’il s’agit d’un comportement wire sortant, pas d’observabilité

#### Dépendance implicite : `telemetry.enabled`

Bien que l’espace de noms soit découplé de `telemetry.*`, **l’activation à l’exécution dépend toujours de `telemetry.enabled: true`** — le SDK OTel n’est initialisé que si la télémétrie est activée ; sans SDK, pas d’installation de propagateur, pas d’appel à `propagation.inject()`, le flag reste un no-op silencieux. Piège potentiel : un opérateur ajoute `propagateTraceContext: true` mais oublie d’activer la télémétrie, aucun `traceparent` n’apparaît côté serveur, sans erreur ni avertissement.

Les deux panneaux orientés utilisateur marquent explicitement cette dépendance :

- La section `propagateTraceContext` de `telemetry.md` est accompagnée d’un exemple JSON complet à deux flags
- La chaîne de description dans `settingsSchema.ts` commence par **« Requires `telemetry.enabled: true` »** (placée avant pour que l’interface de réglages VS Code ne la cache pas après réduction de la description longue)

Si à l’avenir on ajoute l’en-tête d’ID de session ou d’autres réglages `outboundCorrelation.*`, **la même dépendance s’applique** — ils n’ont de sens qu’avec la télémétrie activée (car ils sont injectés via l’instrumentation/le SDK OTel). La PR de suivi devrait hériter de ce modèle de signalement de piège.

### 12.5 Mise en œuvre

| Fichier                                                                          | Changement                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                           | **Supprimé**                                                                                                                                                                                                                     |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                      | **Supprimé**                                                                                                                                                                                                                     |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                               | **Supprimé**                                                                                                                                                                                                                     |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                          | **Supprimé**                                                                                                                                                                                                                     |
| `packages/core/src/telemetry/sdk.ts`                                             | + `NoopTextMapPropagator` ; le propagateur SDK textMapPropagator est déterminé par `getOutboundCorrelationPropagateTraceContext()`                                                                                               |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`              | Suppression de la référence à `wrapFetchWithCorrelation`                                                                                                                                                                         |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`            | Idem                                                                                                                                                                                                                             |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`  | Idem                                                                                                                                                                                                                             |
| `packages/core/src/core/geminiContentGenerator/index.ts`                         | Suppression de la référence à `staticCorrelationHeaders`                                                                                                                                                                         |
| Les `*.test.ts` des 4 fournisseurs ci-dessus                                     | Suppression des cas de test liés à l’ID de session                                                                                                                                                                               |
| `packages/core/src/config/config.ts`                                             | Suppression de `TelemetrySettings.sessionIdHeaderHosts`, `getTelemetrySessionIdHeaderHosts` ; **Ajout de l’interface `OutboundCorrelationSettings` + champ `outboundCorrelationSettings` + accesseur `getOutboundCorrelationPropagateTraceContext()`** |
| `packages/core/src/telemetry/config.ts`                                          | Suppression du passage de `sessionIdHeaderHosts` dans `resolveTelemetrySettings`                                                                                                                                                 |
| `packages/cli/src/config/settingsSchema.ts`                                      | Suppression du schéma `sessionIdHeaderHosts` ; **Ajout de l’élément de schéma de premier niveau `outboundCorrelation`**                                                                                                         |
| `packages/cli/src/config/config.ts`                                              | Passage de `outboundCorrelation: settings.outboundCorrelation` dans `ConfigParameters`                                                                                                                                           |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                     | Régénéré par `npm run generate:settings-schema` (la description sera mise à jour ultérieurement en même temps que la modification)                                                                                              |
| `docs/developers/development/telemetry.md`                                        | Réécriture de « Trace context propagation » → « Client-side HTTP span on outbound fetch » ; suppression de toute la section « Session correlation header » ; ajout d’une section de premier niveau « Outbound correlation (SECURITY-RELEVANT) » ; inclut la note de dépendance `telemetry.enabled` + exemple de configuration JSON |
| `docs/design/telemetry-outbound-propagation-design.md`                           | Cette section + en-tête R4 + pointeur de révision                                                                                                                                                                                |
| `packages/core/src/config/config.test.ts`                                        | **Ajout du bloc describe `OutboundCorrelation Configuration`**, `it.each` avec 4 cas pour verrouiller l’invariance de sécurité de `getOutboundCorrelationPropagateTraceContext` par défaut false (omis / `{}` / true explicite / false explicite) |
### 12.6 Réponse aux méta-arguments de LazzyMan

| Argument                                                                                          | État après R4                                                                                                                             |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| "Le namespace Telemetry sous-entend un collecteur récepteur propriétaire"                         | ✅ Le comportement wire a été déplacé de `telemetry.*` ; le nouveau namespace `outboundCorrelation.*` identifie explicitement la sémantique "tiers sortant" |
| "Le comportement par défaut ne doit pas envoyer d'identifiants à des tiers sans consentement explicite" | ✅ `propagateTraceContext` par défaut false ; l'ensemble du session-id (dans une PR de suivi) sera également désactivé par défaut          |
| "La PR de télémétrie ne doit pas faire passer en contrebande un comportement au niveau wire"      | ✅ Cette PR n'ajoute plus de chemin de code où "la télémétrie contrôle le comportement wire" ; le comportement wire est désormais géré par `outboundCorrelation.*` |
| "la scission est mécanique, le travail n'est pas perdu"                                           | ✅ Le code de R3 a été physiquement supprimé de cette branche, laissé dans l'historique git pour être réutilisé (ou cherry-pické) dans une PR de suivi |

### 12.7 Plan de la PR de suivi (informatif, hors scope de cette PR)

La future PR de suivi devrait inclure :

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` ou un réglage similaire
- Réutiliser le squelette de code déjà implémenté dans R3 : `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`
- Une section sur le modèle de menace, précisant : l'ensemble des destinataires, la fenêtre de désanonymisation des identifiants stables, et une option d'UUID par requête
- **Désactivé par défaut** (pas de liste blanche par défaut – plus strict que R3, conforme aux principes de l'interface en ligne de commande open source de LazzyMan)
- Marquage de sécurité pertinent + inclusion dans docs/users/configuration/settings.md
