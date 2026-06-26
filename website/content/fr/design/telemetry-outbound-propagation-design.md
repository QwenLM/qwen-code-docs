# Télémétrie : Contexte de trace sortant et propagation d'en-tête d'ID de session

> Issue associée : [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Issue parente : [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 observabilité approfondie)
> PR précédente : #4367 (attributs de ressource — fusionné le 2026-05-21, commit `64401e1`)
> Basé sur le 2026-05-21 de la branche `main` de qwen-code + vérification directe du code source de claude-code

## Historique des révisions

| Révision | Date       | Déclencheur                                    | Résumé                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------- | ---------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1       | 2026-05-21 | Première version                               | Diffusion complète : toutes les requêtes LLM sortantes portent `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                                                                                                                                                                                          |
| R2       | 2026-05-22 | Revue R2/R3 de wenshao                         | Sécurité des limites : normalisation d'URL, correspondance de port, alignement des guillemets, `try/catch` pour `staticCorrelationHeaders`, correction du `fallback` host:port                                                                                                                                                                                                                                                                                  |
| R3       | 2026-05-23 | REQUEST_CHANGES de LaZzyMan                    | **Changement sémantique majeur** : la portée par défaut de `X-Qwen-Code-Session-Id` est réduite à une liste blanche d'hôtes first-party (Alibaba/DashScope). Voir §11.                                                                                                                                                                                                                                                                                          |
| R4       | 2026-05-25 | Suivi round-8 de LaZzyMan (confusion de scope) | **Réduction significative du périmètre de la PR** : cette PR ne conserve plus que le span HTTP client + la protection de boucle OTLP ; `traceparent` est désactivé par défaut (`NoopTextMapPropagator`) ; nouveau namespace `outboundCorrelation.*` au niveau supérieur pour les toggles de sécurité ; l'ensemble du mécanisme `X-Qwen-Code-Session-Id` déployé en R3 est **retiré de cette PR**, déplacé vers une PR de suivi indépendante. Voir §12. |

**Note spéciale** : lors de la lecture des §3.1 (Objectifs) / §3.2 (Non-objectifs) / §4.3 (Conception Partie B) / §4.4 (Impact sur le schéma de configuration) / §5 (Liste des modifications de fichiers) / §9 (Comparaison avec claude-code) / §10 (Travaux futurs) / §11 (Portée de la liste blanche d'hôtes R3), veuillez également consulter le §12 — **La révision R4 invalide l'affirmation des R1-R3 selon laquelle "cette PR déploie à la fois `traceparent` et `session id header`"** : cette PR se limite désormais à une observabilité de télémétrie + un toggle de contexte de trace sortant indépendant ; tout le travail d'en-tête de corrélation sortant (y compris la liste blanche d'hôtes de R3) est déplacé en bloc vers une PR de suivi. Le code de R3 lui-même n'est pas perdu ; il sera réutilisé dans la PR de suivi.

## 1. Contexte

La PR #4367 a résolu les **attributs et la cardinalité sur la télémétrie émise** (l'opérateur peut ajouter des étiquettes comme `user.id`/`tenant.id` aux spans/logs/metrics). Mais il y a un aspect qu'elle n'a pas touché : **les en-têtes HTTP des requêtes LLM sortantes**. Aujourd'hui, les requêtes de qwen-code vers DashScope / OpenAI / Gemini / Anthropic **ne portent absolument aucun en-tête de corrélation inter-processus** — ni le W3C `traceparent`, ni l'ID de session.

Conséquences :

1. Le contexte de trace est interrompu à la frontière du processus qwen-code. Si le service de modèle (par exemple DashScope avec instrumentation ARMS Tracing) possède sa propre instrumentation OTel, les spans qu'il génère sont indépendants de la trace de qwen-code ; il n'existe pas d'arbre de trace de bout en bout.
2. Aucun ID de session sur le fil. Pour associer les métriques/logs de qwen-code aux journaux côté serveur, il faut une correspondance hors ligne basée sur l'ID de trace ou l'horodatage, bien moins simple que de lire directement un en-tête.
3. Il manque un span HTTP côté client dans la trace locale. Actuellement, on ne voit que le temps total de `api.generateContent`, pas le TTFB réseau / la taille du corps de la réponse / le nombre de tentatives.

## 2. État actuel

### 2.1 Seule `HttpInstrumentation` est activée

`packages/core/src/telemetry/sdk.ts:330` :

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` ne hook que les modules `http`/`https` natifs de Node, **pas** le chemin `globalThis.fetch` / undici.

### 2.2 Les deux SDK LLM utilisent fetch / undici

| SDK                                              | Implémentation HTTP                                                                                                                                    | Couvert par `HttpInstrumentation` |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ soit undici). Preuve : `node_modules/openai/internal/shims.mjs` renvoie `'fetch' is not defined as a global`              | ❌                                |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Preuve : appel à `new Headers()` dans `dist/node/index.mjs`                                                      | ❌                                |
| `@anthropic-ai/sdk` (anthropicContentGenerator)  | Également basé sur fetch                                                                                                                               | ❌                                |

### 2.3 Aucune propagation manuelle dans la base de code

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Vide. Aucun appel à `propagation.inject()`, aucune injection manuelle de traceparent.

### 2.4 État actuel de `defaultHeaders` par fournisseur

Famille OpenAI (utilise le SDK `openai`) :

Tous les sous-fournisseurs OpenAI étendent `DefaultOpenAICompatibleProvider`. **Le comportement de `buildHeaders` se divise en deux catégories** (vérifié par grep audit) :

| Provider   | Fichier                | Comportement de `buildHeaders()`                                                               | Impact                                         |
| ---------- | ---------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Classe de base | `default.ts:63-74`     | Fournit `{ 'User-Agent' }` + customHeaders                                                     | Modifier ici                                   |
| DashScope  | `dashscope.ts:110-124` | **`override` mais n'appelle pas `super`** — retourne un nouvel objet `User-Agent` + `X-DashScope-*` | **Doit être modifié séparément**, sinon perte |
| OpenRouter | `openrouter.ts:20-30`  | `override` mais **appelle d'abord `const baseHeaders = super.buildHeaders()`**                  | Héritage automatique depuis la classe de base ✅ |
| DeepSeek   | `deepseek.ts`          | N'override pas `buildHeaders` (override seulement `buildRequest` / `getDefaultGenerationConfig`) | Héritage automatique ✅                        |
| Minimax    | `minimax.ts`           | Comme DeepSeek                                                                                  | Héritage automatique ✅                        |
| Mistral    | `mistral.ts`           | Comme DeepSeek                                                                                  | Héritage automatique ✅                        |
| ModelScope | `modelscope.ts`        | Comme DeepSeek                                                                                  | Héritage automatique ✅                        |

→ **La famille OpenAI nécessite de toucher 2 fichiers** : `default.ts` et `dashscope.ts`. Les 5 autres héritent automatiquement.

Google Gemini :

| Provider | Fichier                          | Chemin d'injection des en-têtes                              |
| -------- | -------------------------------- | ------------------------------------------------------------ |
| Gemini   | `geminiContentGenerator.ts:59`   | `new GoogleGenAI({ httpOptions: { headers } })` — support natif du SDK |

Anthropic :

| Provider  | Fichier                                                                                             | Chemin d'injection des en-têtes |
| --------- | --------------------------------------------------------------------------------------------------- | ------------------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders` arg to `new Anthropic`) | `defaultHeaders`                |

**Total de 4 points de construction SDK** où injecter l'en-tête d'ID de session. Tous les SDK prennent déjà en charge `defaultHeaders` / `httpOptions.headers`, aucun wrapper fetch n'est nécessaire.

### 2.5 Configuration proxy et fetch existante

`provider/default.ts:87-89` :

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` renvoie `{ fetch: customFetch }` ou similaire lorsque l'utilisateur configure un proxy, déclenchant `setGlobalDispatcher(new ProxyAgent(...))` (voir `config.ts:1126-1128`). **Le mode dispatcher global d'undici est compatible avec `UndiciInstrumentation`** — il fonctionne via monkey-patch de `globalThis.fetch` et la collaboration des diagnostics de canal d'undici, sans dépendre d'un dispatcher spécifique.

## 3. Objectifs / Non-objectifs

### 3.1 Objectifs

- Toutes les requêtes LLM sortantes portent automatiquement l'en-tête W3C `traceparent` (propagateur `W3CTraceContextPropagator` par défaut du SDK OTel)
- ~~Toutes~~ les requêtes LLM sortantes portent l'en-tête `X-Qwen-Code-Session-Id` (espace de nommage produit similaire à claude-code) — **Révision R3** : par défaut injecté uniquement sur les hôtes first-party (Alibaba/DashScope) ; pas envoyé aux fournisseurs tiers par défaut ; voir §11
- Éviter automatiquement la trace sur le point de terminaison de l'exportateur OTLP lui-même (boucle de rétroaction)
- Ajouter un span client précis pour les requêtes LLM (séparation entre le temps réseau et le temps modèle)
- Couvrir les 4 points de construction : classe de base OpenAI, override DashScope, Gemini, Anthropic
- Pas de dégradation pour les requêtes streaming / mode proxy / scénarios de tentative
- Cohérent avec la philosophie de conception de #4367 : via les options natives du SDK telles que `defaultHeaders` — **Révision R1** : en raison du problème de fraîcheur, passer à un wrapper fetch ; **Révision R3** : ajouter une porte d'hôte à l'intérieur du wrapper fetch

### 3.2 Non-objectifs

- **En-tête `baggage`** : Le SDK standard le supporte déjà, mais qwen-code n'appelle pas `propagation.setBaggage()`, donc il ne sera pas envoyé par défaut. Cette conception ne l'active pas activement.
- **Héritage de la variable d'environnement `TRACEPARENT` vers les sous-processus** : claude-code injecte `TRACEPARENT` dans les sous-processus Bash/PowerShell. `BashTool` de qwen-code ne le fait pas. C'est un sous-issue de suivi indépendant.
- **Lecture de `TRACEPARENT` / `TRACESTATE` entrant** : Le mode `-p` de claude-code et le SDK Agent lisent `traceparent` depuis l'environnement pour continuer la trace du processus parent. qwen-code ne le fait pas. Suivi indépendant.
- **`X-Qwen-Code-Request-Id`** : claude-code a `x-client-request-id`, utile pour la corrélation en cas de timeout. Pas dans cette itération ; pourrait être un prochain sous-issue.
- **Propagateur personnalisé (B3 / Jaeger / X-Ray)** : Le W3C par défaut couvre déjà 99% des cas. Option de configuration future possible.
- ~~**Injection sélective par point de terminaison** : claude-code n'envoie pas `traceparent` aux points de terminaison tiers (Bedrock / Vertex) ; qwen-code n'a pas besoin de distinction tiers, peut tout envoyer uniformément.~~ — **Révision R3** : cette affirmation est réfutée. La revue de LaZzyMan a souligné que qwen-code est un CLI open source se connectant à plusieurs fournisseurs tiers (OpenAI / Anthropic / OpenRouter / etc.) ; l'analogie first-party→first-party de claude-code ne s'applique pas ; l'en-tête d'ID de session doit être différencié par hôte. Voir §11. `traceparent` reste injecté sur tous comme dans la conception R1 (en-tête standard OTel, et l'ID de trace est un hash `sha256(sessionId)`), pourrait être un toggle par destination (`telemetry.propagateTraceContext`) en suivi.

## 4. Conception

### 4.1 Couches générales

```
┌─ processus qwen-code ────────────────────────────────────────────┐
│                                                                    │
│  ┌─ session-tracing.ts ─┐                                         │
│  │ contexte de span actif │                                        │
│  └──────┬───────────────┘                                         │
│         │                                                          │
│         ▼                                                          │
│  ┌─ propagation.inject() (appelé par l'instrumentation undici) ─┐ │
│  │ écrit `traceparent: 00-<traceId>-<spanId>-01` dans les en-têtes │ │
│  └───────────────────────────────────────────────────────────────┘ │
│         │                                                          │
│  ┌──────▼──────────────────────────────────────────────────────┐  │
│  │   fetch() — undici, instrumenté                             │  │
│  │   crée un span HTTP client                                  │  │
│  │   injecte traceparent dans les en-têtes de la requête       │  │
│  │   (ignoré via ignoreRequestHook si le point de terminaison est OTLP) │  │
│  └─────────────────────────────────────────────────────────────┘  │
│         │                                                          │
│         │   ┌─ defaultHeaders (par constructeur SDK) ───────┐     │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... }  │      │
│         └───┴────────────────────────────────────────────────┘     │
│             │                                                      │
└─────────────┼──────────────────────────────────────────────────────┘
              │
              ▼ HTTP sortant
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (User-Agent existant, X-DashScope-*, etc.)
```

Deux chemins d'injection indépendants et non dépendants :

| Couche               | Quand injecté                              | Qui injecte                                                   |
| -------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `traceparent`        | À chaque appel fetch                       | `UndiciInstrumentation` automatiquement (propagateur par défaut du SDK OTel) |
| `X-Qwen-Code-Session-Id` | Une fois lors de la construction du SDK dans `defaultHeaders` | Code applicatif                                             |

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

#### Pourquoi `ignoreRequestHook` est nécessaire

Le SDK OTel utilise lui-même fetch pour envoyer les données au collecteur OTLP. Sans cet ignore, `UndiciInstrumentation` créerait un span pour la requête "d'envoi" → ce nouveau span serait à nouveau envoyé → boucle infinie / bruit énorme. Tous les projets OTel sont tombés dans ce piège, et la documentation OTel recommande explicitement ce hook.

#### Propagateur par défaut

`NodeSDK` du SDK OTel utilise par défaut `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])` si `textMapPropagator` n'est pas passé. Aucune configuration explicite nécessaire.

#### Format de `traceparent`

```
traceparent: 00-<traceId 32 hex>-<spanId 16 hex>-<01 échantillonné | 00 non échantillonné>
              ─┬─                                          ─┬─
               version (fixe 00)                            flags
```

Taille fixe de 55 octets, sans padding.

#### `tracestate` et `baggage`

- `tracestate` : transmis seulement s'il vient de l'amont ; l'injection par défaut n'en ajoute pas (comportement du SDK OTel).
- `baggage` : présent uniquement si `propagation.setBaggage(ctx, ...)` a été appelé. qwen-code ne l'appelle pas, donc ne sera pas envoyé.

### 4.3 Partie B — `X-Qwen-Code-Session-Id` via wrapper fetch (OpenAI / Anthropic) + en-têtes statiques (Gemini)

> **Révision R3** : la conception ci-dessous décrit la résolution du problème de fraîcheur du wrapper fetch et les 4 points d'intégration — ceux-ci sont conservés. Mais une porte de liste blanche d'hôtes a été ajoutée à l'intérieur du wrapper, et `staticCorrelationHeaders` a également un paramètre `destinationUrl`. Le code d'implémentation le plus récent avec la porte d'hôte et la liste blanche par défaut est au §11.

#### Critique : problème de fraîcheur et choix de solution

L'approche naïve (`defaultHeaders` qui bake `getSessionId()` directement) a un **vrai bug** :

1. `pipeline.ts:60` construit `this.client = this.config.provider.buildClient()` une fois lors de la construction de contentGenerator ; le `defaultHeaders` du client SDK capture l'ID de session à ce moment-là
2. `config.ts:1850` la réinitialisation de session (déclenchée par `/clear` utilisateur) met à jour `this.sessionId` et appelle `refreshSessionContext()`, mais **ne reconstruit pas contentGenerator**
3. Les appels LLM suivants utilisent toujours l'ancien client → l'en-tête sur le fil est toujours l'ancien ID de session → décalage de corrélation côté serveur

→ L'ID de session doit être lu **par requête**, pas à la construction.

#### Solution

```
                   ┌─ support fetch ─┐  Solution
OpenAI SDK          │     ✅          │  wrapper fetch (lecture sessionId par requête) ✅
Anthropic SDK       │     ✅          │  wrapper fetch ✅
@google/genai SDK   │     ❌          │  httpOptions.headers statiques + acceptation du décalage
                   └──────────────────┘
```

L'interface `HttpOptions` de `@google/genai` ne supporte pas `fetch` (vérifié par grep de `node_modules/@google/genai/dist/genai.d.ts` : seulement `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Donc Gemini utilise des en-têtes statiques, en contradiction avec OpenAI/Anthropic — c'est une **limitation connue**, voir §8.6.

#### Fonction d'assistance centralisée (wrapper fetch par requête)

Nouveau fichier `packages/core/src/telemetry/llm-correlation-fetch.ts` :

```ts
import type { Config } from '../config/config.js';

/**
 * Wrap a fetch implementation so every outbound request gets correlation
 * headers (`X-Qwen-Code-Session-Id`) populated from the **current** session
 * id, not the value captured when the SDK client was constructed.
 *
 * Matches claude-code's pattern (src/services/api/client.ts:370-390 —
 * `buildFetch()`). Per-request injection is necessary because `/clear`
 * resets the session id mid-process; SDK clients (and their static
 * `defaultHeaders`) are NOT recreated on reset.
 *
 * Caller responsible for choosing the base fetch — usually
 * `runtimeOptions?.fetch ?? globalThis.fetch` so proxy-aware fetch is
 * preserved when ProxyAgent is in use.
 *
 * If telemetry is disabled, returns baseFetch unchanged (no correlation
 * header is added, matching the privacy stance of §3.1).
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
      // Defensive: empty header value is rejected by some HTTP middleware.
      // Skip injection rather than send `X-Qwen-Code-Session-Id: `.
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```

Fonction d'assistance pour les SDK qui ne peuvent prendre que des en-têtes statiques (Gemini) :

```ts
/**
 * Static correlation headers. Captures the session id at call time —
 * **subject to staleness** if the host SDK keeps these headers in a
 * captured-at-construction slot (e.g. `@google/genai`'s `httpOptions.headers`).
 * Prefer `wrapFetchWithCorrelation` whenever the SDK exposes a `fetch` hook.
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
  // ... existing ...
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
    // After spread, override `fetch` so our correlation wrapper wraps the
    // proxy-aware fetch (or globalThis.fetch when no proxy).
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` inchangé.

#### Point d'intégration 2 : `provider/dashscope.ts` (override)

Même motif de composition dans `buildClient()` (elle override déjà `buildClient`). `buildHeaders()` inchangé.

#### Point d'intégration 3 : `geminiContentGenerator/index.ts` (factory, PAS constructeur)

**Correction de la déclaration excessive de la conception précédente** : le constructeur de `geminiContentGenerator.ts` **n'a pas** besoin de changer de signature. La fonction factory dans `index.ts:48` reçoit déjà `gcConfig: Config` (la ligne 33 utilise déjà `gcConfig?.getUsageStatisticsEnabled()`), il suffit de fusionner les en-têtes statiques de corrélation dans `httpOptions.headers` au sein de la factory :

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... existing x-gemini-api-privileged-user-id ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← new
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) unchanged
```

Zéro modification de signature.

#### Point d'intégration 4 : `anthropicContentGenerator.ts`

Le SDK Anthropic accepte également un `fetch` personnalisé (utilise déjà `buildRuntimeFetchOptions`). Il suffit d'envelopper le fetch dans le chemin `buildClient` de la même manière que pour OpenAI `default.ts`. `buildHeaders` inchangé.

#### Chaîne de priorité

Inchangée : les `customHeaders` de l'utilisateur l'emportent toujours lors de la fusion dans `defaultHeaders` (voir discussion sur l'usurpation §8.2). Le `X-Qwen-Code-Session-Id` injecté par le wrapper fetch est ajouté **après** la liste des en-têtes du SDK dans l'objet `Headers` final — avec la sémantique de `Headers.set()` de Node, cela écrase tout en-tête précédent du même nom (y compris celui écrit dans les customHeaders de l'utilisateur).

**Pour OpenAI/Anthropic (chemin wrapper fetch)** : corrélation > customHeaders > valeurs par défaut du SDK.
**Pour Gemini (chemin en-têtes statiques)** : customHeaders > corrélation > valeurs par défaut du SDK (ordre de spread existant conservé).

La différence est que sur le chemin wrapper fetch, l'usurpation n'est plus possible (le wrapper fetch s'exécute après les en-têtes du SDK). C'est un **sous-produit de la correction de bug**, pas un durcissement intentionnel — mais plus sûr. À indiquer clairement au §8.2.

### 4.4 Impact sur le schéma de configuration

~~**Presque nul**. Cette conception n'introduit pas de nouveau paramètre~~ — **Révision R3** : introduit un nouveau paramètre `telemetry.sessionIdHeaderHosts: string[]` pour remplacer la liste blanche d'hôtes first-party par défaut. L'élément de schéma a été ajouté dans `packages/cli/src/config/settingsSchema.ts`, avec la description et la syntaxe de remplacement (`["*"]` pour rétablir la diffusion / `[]` pour tout désactiver / tableau personnalisé) au §11. La description originale ci-dessous ne s'applique qu'avant R3.
- L'injection de `traceparent` est déclenchée par `telemetry enabled` (toggle existant)
- L'injection de `X-Qwen-Code-Session-Id` est également déclenchée par `telemetry enabled`
- L'URL OTLP de `ignoreRequestHook` est déjà lue depuis la configuration existante

Paramètres pouvant être ajoutés à l'avenir (**hors scope**) :

- `telemetry.outboundCorrelationHeader` : nom d'en-tête personnalisé (par défaut `X-Qwen-Code-Session-Id`)
- `telemetry.outboundPropagationDisabled` : désactivation globale (si le service LLM est strict avec les en-têtes inconnus)
- ~~per-destination header scope toggle~~ — **déjà livré en R3**, voir §11

## 5. Liste des modifications de fichiers

| Fichier                                                                         | Type de modification | Description                                                                                                                                                            |
| ------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                    | ajout de dépendance  | `@opentelemetry/instrumentation-undici`                                                                                                                                |
| `packages/core/src/telemetry/sdk.ts`                                            | modification         | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                         |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | nouveau fichier      | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (Gemini fallback)                                                                       |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | modification         | `buildClient()` ajoute `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)` dans `new OpenAI({...})`                                                                |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | modification         | Idem (override `buildClient`)                                                                                                                                          |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | modification         | Dans la factory, merge `staticCorrelationHeaders(gcConfig)` dans `httpOptions.headers` (**l'appelant a déjà Config, zéro changement de signature** — correction de la sur-spécification précédente) |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | modification         | Sous le chemin `buildClient`, wrapper l'option `fetch` du SDK avec `wrapFetchWithCorrelation`                                                                         |

**Explicitement audité mais aucune modification nécessaire** (pour éviter que les réviseurs suspectent des chemins manquants) :

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`, utilise `DashScopeOpenAICompatibleProvider`, **hérite automatiquement de la modification de `buildClient` dans `dashscope.ts`**. Tous les flux Qwen OAuth en bénéficient également.
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — mode wrapper, ne construit pas de client SDK (il wrappe d'autres contentGenerator pour le logging de télémétrie), aucune modification nécessaire.
- `packages/core/src/core/contentGenerator.ts` — point d'entrée de la factory, ne possède pas de client.
  | `packages/core/src/telemetry/sdk.test.ts` | modification | ajout de l'enregistrement d'instrumentation undici + test de `ignoreRequestHook` |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | nouveau fichier | tests unitaires du comportement telemetry-on/off + vérification de la lecture de sessionId par requête (critique : après un reset de session, le wrapped fetch lit le nouvel id) |
  | `*.test.ts` de chaque provider | modification | affirme que l'option `fetch` lors de la construction du SDK est une version wrapper (OpenAI/Anthropic) ; affirme que `httpOptions.headers` de la construction Gemini contient `X-Qwen-Code-Session-Id` |
  | `docs/developers/development/telemetry.md` | modification | ajout de la section "Trace context & session correlation propagation" |
  | `docs/design/telemetry-outbound-propagation-design.md` | ce fichier | document de conception |

## 6. Découpage en PR

Divisé en deux PR pour la convivialité des révisions (peut aussi être combiné, la taille le permet) :

### PR 1 — Injection automatique de `traceparent` (structurelle)

- Ajouter la dépendance `@opentelemetry/instrumentation-undici`
- Ajouter `UndiciInstrumentation` + `ignoreRequestHook` dans `sdk.ts`
- Tests : enregistrement SDK, point de terminaison OTLP non tracé
- Fragment de documentation

**Risque** : faible. Additif. Les client spans existants sont un gain net, ne changent pas la structure des spans actuelles.

### PR 2 — En-tête `X-Qwen-Code-Session-Id` (avec fonctions auxiliaires)

- Nouveau fichier `llm-correlation-headers.ts`
- Intégration dans 4 providers
- Tests : chaque provider vérifie la présence de l'en-tête ; aucun envoi quand telemetry est désactivé
- Fragment de documentation

**Risque** : faible-moyen. Attention, l'extension de la signature du constructeur `geminiContentGenerator` pourrait impacter les appelants.

### PR 3 (optionnelle) — Documentation + vérification E2E

- Compléter le paragraphe `telemetry.md`
- Ajouter un script de vérification E2E (réutiliser le modèle `/tmp/verify-telemetry-pr-4367.mjs`) : exécuter fetch + capturer les en-têtes

Peut aussi être fusionné dans la PR 2.

### Ordre préférentiel

Techniquement, PR 1 et PR 2 sont **indépendantes** — elles ne partagent pas de code. Mais **il est recommandé de fusionner PR 1 en premier** :

- `traceparent` est un en-tête **standard** OTel, reconnu immédiatement par tout collecteur / backend compatible OTel → l'utilisateur en profite tout de suite
- `X-Qwen-Code-Session-Id` est un en-tête **personnalisé au produit**, nécessite une configuration back-end pour être utile → bénéfice différé
- Si la revue de PR 2 est longue, PR 1 permet déjà d'avoir le trace cross-process
- PR 1 est additive et structurelle (faible risque), idéale pour établir la confiance

## 7. Plan de tests

### 7.1 Tests unitaires de `sdk.ts`

- ✅ `UndiciInstrumentation` présent dans les `instrumentations` de `NodeSDK`
- ✅ `ignoreRequestHook` retourne `true` pour `https://collector:4318/v1/traces`
- ✅ `ignoreRequestHook` retourne `false` pour `https://dashscope.aliyuncs.com/...`
- ✅ Correspond correcte avec ou sans slash final

### 7.2 Tests unitaires de `llm-correlation-fetch.ts`

**`wrapFetchWithCorrelation`** :

| Scénario                                                                        | Attendu                                                                                            |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                                               | wrapped fetch = baseFetch (aucun en-tête ajouté)                                                   |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"                         | `init.headers` de la requête envoyée par wrapped fetch contient `X-Qwen-Code-Session-Id: abc-123`  |
| `init.headers` contient déjà `X-Qwen-Code-Session-Id: spoof`                    | Remplacé par le vrai sessionId après wrapper (le chemin fetch wrapper ne permet pas le spoof, §8.1)|
| **Le wrapped fetch est appelé à nouveau après un reset de session**            | **Lit le nouveau sessionId** (garde contre la régression de l'obsolescence)                        |
| baseFetch rejette                                                                | Le wrapper transmet le rejet sans l'avaler                                                          |

**`staticCorrelationHeaders`** (chemin Gemini) :

| Scénario                                                    | Retour attendu                                               |
| ----------------------------------------------------------- | ------------------------------------------------------------ |
| `getTelemetryEnabled() === false`                           | `{}`                                                          |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"     | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                   |
| sessionId contient des caractères unicode (`會話-1`)        | Retourné tel quel — le SDK se charge de l'encodage HTTP      |
| sessionId est une chaîne vide                               | `{ 'X-Qwen-Code-Session-Id': '' }` — invariant métier, pas de validation à ce niveau |

### 7.3 Tests d'intégration par provider

Ajouter dans les tests de `buildHeaders()` / construction de chaque provider :

```ts
it('includes X-Qwen-Code-Session-Id when telemetry enabled', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('omits X-Qwen-Code-Session-Id when telemetry disabled', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 Vérification E2E (tmux + serveur HTTP local)

⚠️ **Ne pas** mocker `globalThis.fetch` pour capturer les en-têtes : `UndiciInstrumentation` se branche via le canal de diagnostic d'undici ; patcher `globalThis.fetch` pourrait contourner complètement l'instrumentation (selon l'ordre des patchs), rendant l'injection de `traceparent` non testable. **La bonne méthode est de lancer un serveur HTTP local**, laisser le SDK faire une vraie requête, et le serveur enregistre les en-têtes reçus.

Écrire un script similaire à `/tmp/verify-telemetry-pr-4367.mjs` :

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` démarre un serveur local
2. Activer telemetry + outfile + pointer `baseURL` du SDK OpenAI vers `http://127.0.0.1:<port>` (ou utiliser un mock provider pour que le SDK fasse un vrai fetch)
3. Déclencher un `client.chat.completions.create(...)` (nécessite une réponse mock minimale analysable, sinon le SDK lèvera une erreur — une réponse OpenAI valide mais vide du serveur local suffit)
4. Vérifier que `capturedHeaders[0]` contient `traceparent: 00-...` et `X-Qwen-Code-Session-Id: <sessionId>`
5. Démarrer un autre mock de collecteur OTLP sur un port différent, vérifier que les rapports OTLP qui lui sont envoyés **ne déclenchent pas** d'injection de `traceparent` (valide `ignoreRequestHook`)
6. **Supplémentaire : vérification d'obsolescence** — émettre requête 1 → appeler `config.resetSession(...)` → émettre requête 2 → vérifier que `X-Qwen-Code-Session-Id` de la requête 2 est le nouvel id de session (**test de régression critique pour le correctif #1**)

### 7.5 Protection contre les régressions

- Les fetch de streaming chat completion (avec `stream: true`) doivent toujours se fermer correctement — `UndiciInstrumentation` a eu par le passé des bugs liés au cycle de vie des spans pour les réponses streaming. **Lors de l'implémentation, exécuter un streaming completion de bout en bout pour vérifier que la client span se termine correctement, qu'il n'y a pas de span fuyante et que le flux n'est pas interrompu** ; ne pas supposer qu'un numéro de version spécifique corrige ces bugs.
- Le mode proxy (`ProxyAgent`) et l'instrumentation activés simultanément — `ignoreRequestHook` continue de matcher sur la chaîne de point de terminaison, le proxy n'affecte pas.
- Les tentatives (`maxRetries`) obtiennent chacune une client span indépendante, mais partagent toutes le même parent `traceparent` (idéalement les tentatives devraient être des child spans sous un même parent span — ce comportement est laissé au SDK, cette conception n'impose rien).

## 8. Cas limites / angles morts

### 8.1 Comportement incohérent entre `customHeaders` et le spoofing

Les chemins des différents providers présentent des comportements de spoofing **différents** (conséquence de conception, pas un resserrement intentionnel) :

| Chemin du provider                           | Spoofing possible ? | Raison                                                                                                                      |
| -------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (chemin fetch wrapper)     | ❌ Non             | Le fetch wrapper exécute `headers.set('X-Qwen-Code-Session-Id', ...)` après la liste des en-têtes SDK, écrasant le customHeaders du même nom |
| Gemini (chemin en-têtes statiques)           | ✅ Oui             | Ordre de fusion `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }` — `customHeaders` gagne en dernier            |

claude-code utilise également le chemin fetch wrapper, comportement identique à OpenAI/Anthropic (spoofing impossible). C'est un sous-produit de la correction du bug d'obsolescence, pas un objectif initial.

**Il n'est pas prévu d'"aligner" les deux chemins** — le comportement du chemin Gemini est dû à une limitation du SDK (pas de hook `fetch`), et rétrograder OpenAI à un mécanisme statique n'est pas pertinent.

Le spoofing d'id de session n'est pas une vraie menace (l'utilisateur contrôle le local, peut modifier le code source directement). La documentation doit mentionner cette différence pour éviter que les réviseurs ne remettent en question la priorité des `customHeaders` quand le chemin fetch wrapper ne permet pas le spoofing.

### 8.2 Deux cas particuliers de correspondance d'URL de collecteur OTLP

#### (a) Jeton d'authentification dans l'URL

Si l'utilisateur a un point de terminaison OTLP comme `https://collector/path?token=secret`, `ignoreRequestHook` avec `url.startsWith(e)` correspondrait en incluant la chaîne de requête. Mais le `request.path` donné par undici ne va que jusqu'au chemin (sans requête), donc la comparaison ne prend que la partie chemin. Pour plus de sécurité, supprimer la requête :

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) Faux positif théorique de `startsWith` au-delà du nom d'hôte

Si `e = "http://collector"` (sans port), une URL de requête `http://collector-fake/v1/traces` serait incorrectement matchée par `startsWith`.

**Probabilité de déclenchement extrêmement faible** :

- Les points de terminaison OTLP sont presque toujours avec un port (4317 gRPC / 4318 HTTP), sous la forme `http://collector:4318` ; une extension comme `-fake` est impossible (après le port suit `/`)
- Un utilisateur configurant un point de terminaison sans port est une erreur de configuration, le SDK devrait déjà utiliser un fallback par défaut

**Si on veut renforcer** : analyser l'origine URL + le chemin séparément, ne pas utiliser `startsWith` brut :

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

Pas fait dans cette itération — la surcharge est inutile, le faux positif ne se produira pas en pratique.

### 8.3 Gemini en mode Vertex AI

`@google/genai` supporte le mode `vertexai: true` (utilise les identifiants GCP pour le point de terminaison Vertex au lieu du point de terminaison generative ai). Les deux modes passent par fetch, donc l'instrumentation couvre les deux. `httpOptions.headers` fonctionne dans les deux modes.

### 8.4 Logique existante `defaultHeaders` dans le SDK Anthropic

`anthropicContentGenerator.ts:177` appelle déjà `buildHeaders()` puis le passe à `new Anthropic({ defaultHeaders })`. Mais l'obsolescence s'applique aussi — cette conception utilise le chemin fetch wrapper (comme OpenAI).

### 8.5 En-têtes trailer entre SDK et fetch

Le SDK `openai` peut utiliser `Transfer-Encoding: chunked` et des en-têtes trailer en streaming. Cela n'affecte pas l'injection de `traceparent` / `X-Qwen-Code-Session-Id` au moment de la requête — ils sont des en-têtes de requête, écrits en une seule fois à l'envoi.

### 8.6 ⚠️ Limitation connue : l'id de session de Gemini devient obsolète après `/clear`

Étant donné que le SDK `@google/genai` ne supporte pas de hook `fetch` (l'interface `HttpOptions` n'a que `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`), le provider Gemini passe par le chemin statique `httpOptions.headers` — l'id de session est capturé à la construction du SDK, **il n'est pas rafraîchi après un reset de session déclenché par `/clear`**.

**Périmètre d'impact réel** :

- L'utilisateur lance qwen-code → `/clear` → utilise le modèle Gemini → le `X-Qwen-Code-Session-Id` sur le fil est l'ancien id de session
- La corrélation back-end est décalée (le trace id et les logs sont correctement passés à la nouvelle session, mais l'en-tête filaire est en retard)

**Pourquoi ne pas corriger** (dans cette itération) :

- Les chemins OpenAI / Anthropic **n'ont pas ce bug** (le chemin fetch wrapper lit l'id de session par requête)
- Le correctif pour Gemini a plusieurs options, toutes hors scope de cette itération (voir ci-dessous)

**Options de correctif futur** (par ordre de recommandation) :

| Option                                          | Description                                                                                                 | Coût                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **A. Invalidation paresseuse** ★ recommandé      | Lors d'un reset de session, marquer contentGenerator comme sale ; recréer paresseusement à la prochaine appel LLM | Faible : ~10 lignes à ajouter dans `resetSession` + point d'entrée d'appel LLM ; API synchrone, non intrusive |
| B. Recréation immédiate                         | Lors d'un reset de session, exécuter immédiatement `await createContentGenerator(...)`, nécessite async sur `resetSession` | Moyen : modification d'API en cascade à plusieurs endroits                                     |
| C. Objet d'en-têtes proxy                       | Envelopper `httpOptions.headers` avec un Proxy interceptant le getter                                      | Risqué : le comportement interne de `@google/genai` peut ne pas relire les en-têtes par requête, le comportement pourrait silencieusement se briser |
| D. Pousser en amont le support d'option `fetch` dans `@google/genai` | Soumettre une PR à google-deepmind/generative-ai-js                                                          | Long terme ; incontrôlable                                                                    |

**La documentation doit indiquer aux utilisateurs** : lors de l'utilisation du provider Gemini, si un appel LLM est effectué immédiatement après `/clear`, l'id de session sur le fil sera à cet instant l'ancien id. Une correction indirecte peut être faite par corrélation de trace (les spans/logs contiennent déjà le nouvel `session.id`).

Un sous-billet de suivi doit être ouvert pour l'option A.

## 9. Comparaison avec claude-code

| Dimension                        | claude-code                                                                                                                                          | qwen-code (cette conception)                                                                                                                                                                                                                                                               | Décision justifiée                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Nom de l'en-tête d'id de session | `X-Claude-Code-Session-Id` (préfixe produit)                                                                                                        | `X-Qwen-Code-Session-Id` (préfixe produit)                                                                                                                                                                                                                                                 | ✅ Même stratégie d'espace de noms                                                                                             |
| Mécanisme d'injection d'id de session | `defaultHeaders` du SDK (`client.ts:108`) + wrapper `buildFetch()` personnalisé (`client.ts:370-390`, injection per-request de `randomUUID()` pour `x-client-request-id`) | OpenAI/Anthropic passent par fetch wrapper (lecture per-request de l'id de session, évite l'obsolescence après `/clear`) ; Gemini passe par `httpOptions.headers` statique (limitation SDK)                                                                                                  | Aligné sur le modèle fetch wrapper de claude-code. claude-code utilise aussi un fetch wrapper pour ajouter `x-client-request-id` par requête. |
| Persistance de l'id de session  | Pas de reset de session de type `/clear` ; session = processus                                                                                      | Reset via `/clear` → le chemin fetch wrapper suit automatiquement ; le chemin en-têtes statiques devient obsolète (§8.6)                                                                                                                                                                   | Complexité propre à qwen-code                                                                                                  |
| Encodage de l'id de session     | En-tête HTTP (pas baggage)                                                                                                                          | En-tête HTTP                                                                                                                                                                                                                                                                               | ✅ Identique — favorable au back-end                                                                                           |
| Injection de `traceparent`      | Fermé ; la documentation publique mentionne son existence ; aucun référencement à `propagation.inject` / `UndiciInstrumentation` dans le repo open source | `@opentelemetry/instrumentation-undici` automatique                                                                                                                                                                                                                                        | Comment claude-code l'implémente est invisible. Nous choisissons le chemin recommandé par OTel, plus léger.                    |
| Portée d'envoi de `traceparent` | Uniquement l'API Anthropic first-party ; pas envoyé à Bedrock/Vertex/Foundry                                                                        | Envoyé à tous les fetch sortants (standard W3C ; le trace id est le hash `sha256(sessionId)`). **Révision R3** : l'en-tête d'id de session est injecté uniquement sur la liste blanche first-party (Alibaba/DashScope), les tiers non envoyés par défaut. Voir §11 | Après R3, l'en-tête de session de qwen-code a la même sémantique first-party-only que claude-code ; `traceparent` reste à suivre par per-destination toggle. |
| `x-client-request-id` (aléatoire) | Oui, automatique                                                                                                                                   | Pas fait pour l'instant (un sous-billet de suivi séparé a plus de valeur)                                                                                                                                                                                                                 | Contrôle de périmètre                                                                                                          |
| Variable d'environnement `TRACEPARENT` pour sous-processus | La documentation reconnaît son existence (implémentation fermée)                                                                                   | Pas fait (suivi séparé)                                                                                                                                                                                                                                                                     | Contrôle de périmètre                                                                                                          |
| Lecture de `TRACEPARENT` entrant   | La documentation reconnaît son existence (mode `-p` / Agent SDK)                                                                                   | Pas fait (suivi séparé)                                                                                                                                                                                                                                                                     | Contrôle de périmètre                                                                                                          |

**Annotations vérifié vs documenté** :

| Assertion                                         | Statut de vérification                                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders`   | ✅ Lu dans le code open source `src/services/api/client.ts:108`                                                                                                              |
| `x-client-request-id` via fetch wrapper           | ✅ Lu dans le code open source `src/services/api/client.ts:370-390`                                                                                                          |
| Injection de `traceparent`                        | ⚠️ Seulement mentionné sur docs.claude.com/docs/en/monitoring-usage.md ; `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` dans le repo open source retourne vide |
## 10. Travaux futurs

Sous le ticket #3731 P3, cette conception **n’inclut pas** mais est liée à :

- **`X-Qwen-Code-Request-Id`** – UUID aléatoire par requête (équivalent claude-code : `x-client-request-id`). Utile pour la corrélation des erreurs de timeout : au moment du timeout, le serveur peut ne pas avoir encore assigné un request id, le UUID envoyé par le client est le seul moyen de corrélation. Cette suggestion a plus de sens après la révision R3 : le UUID par requête n’a pas de risque de « profilage inter-requête » et peut être utilisé comme « en-tête de support/débogage envoyé à tout fournisseur LLM ».
- **Bascule de scope par destination pour `traceparent`** – La révision R3 n’a traité que le scope du header session id ; `traceparent` est toujours injecté dans tous les fetch sortants. On pourrait ajouter `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'`, en utilisant la même allowlist que le §11 pour décider du comportement.
- **Invalidation paresseuse du session id stale pour Gemini (option A du §8.6)** : marquer `contentGenerator` comme *dirty* lors du `/clear`, puis le recréer paresseusement lors du prochain appel LLM. Cela permet au chemin Gemini de bénéficier aussi de la mise à jour en temps réel du wrapper fetch.
- **Variable d’environnement `TRACEPARENT` pour les sous-processus** : injecter la variable d’environnement lors de l’exécution des sous-processus de `BashTool`, pour que les outils externes puissent continuer la trace. Nécessite une analyse séparée du cycle de vie des outils.
- **`TRACEPARENT` entrant** : lire la variable d’environnement au lancement en mode `--prompt`, pour que CI / un orchestrateur externe puisse connecter qwen-code à une trace plus large.
- **Nom configurable du header `correlationHeader`** : permettre aux équipes ops d’entreprise de personnaliser le header (par défaut `X-Qwen-Code-Session-Id`).
- **Stratégie de propagation de `baggage`** : doit-on activement définir `baggage` pour que `user.id` / `tenant.id` etc. soient également transmis via `baggage` vers les services aval ? Non traité dans cette itération, en attente d’un besoin clair.

## 11. Révision R3 — Cadrage par allowlist d’hôtes pour `X-Qwen-Code-Session-Id`

> Déclenché : [revue REQUEST_CHANGES de LaZzyMan sur le PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)  
> Commit de mise en œuvre : `1c8528a56` (implémentation cœur) + `cb162e716` (fail-closed sur baseUrl Vertex + tolérance `["*"]` avec trim)

### 11.1 Déclencheur et justification

La conception R1 injectait `X-Qwen-Code-Session-Id` dans **toutes** les requêtes LLM sortantes, contrôlé uniquement par `telemetry.enabled`. La revue de LaZzyMan a soulevé trois problèmes progressifs :

1. **Étiquetage inapproprié** : `feat(telemetry):` + chemin `telemetry/` + porte `getTelemetryEnabled()` laisse l’utilisateur comprendre légitimement « les données d’observabilité de mon propre côté vont vers mon propre collecteur ». Mais `X-Qwen-Code-Session-Id` n’atteint jamais le backend OTLP ; il circule dans les requêtes API LLM vers DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral. Deux décisions différentes concernant la destination des données sont liées au même interrupteur.

2. **L’analogie avec claude-code ne tient pas** : La section §9 de R1 « alignait » la stratégie de namespace et le pattern du wrapper fetch sur claude-code. Mais claude-code est un fournisseur unique (Anthropic) → Anthropic (single vendor, single direction), tandis que qwen-code est un CLI open source → plusieurs fournisseurs tiers. « Un identifiant stable inter-requêtes diffusé à tous les tiers » est un point que R1 n’a pas résolu frontalement.

3. **traceparent est un autre canal de la même empreinte** : trace id = `sha256(sessionId).slice(0, 32)`. Pour le destinataire, c’est toujours un identifiant stable par session (hashé donc non réversible, mais stable pour une même session).

LaZzyMan a établi la sévérité : session id `high` / traceparent `medium`.

### 11.2 Résumé de la solution

**Rétrécissement de la portée par défaut aux hôtes first-party.** Ajout d’un nouveau paramètre :

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // Restaure le comportement de diffusion de R1
  "sessionIdHeaderHosts": []                              // Désactive complètement le header
  "sessionIdHeaderHosts": ["api.mycompany.com",
                           "*.gateway.mycompany.internal"]
}
```

Valeur par défaut (depuis `packages/core/src/telemetry/trusted-llm-hosts.ts:DEFAULT_SESSION_ID_HEADER_HOSTS`) :

```
dashscope.aliyuncs.com
dashscope-intl.aliyuncs.com
*.dashscope.aliyuncs.com
*.dashscope-intl.aliyuncs.com
*.alibaba-inc.com
*.aliyun-inc.com
```

La sémantique de cet ensemble est « fournisseur LLM, backend ARMS Tracing, même entité juridique que la distribution qwen-code » – autrement dit l’équivalent de la relation single-vendor / single-direction de claude-code pour qwen-code. Les fournisseurs tiers (OpenAI / Anthropic / OpenRouter / etc.) **ne reçoivent pas** le header par défaut.

### 11.3 Syntaxe des patterns (intentionnellement minimaliste)

`matchesTrustedHost(hostname, patterns)` ne supporte que deux formes, alignées sur `DashScopeOpenAICompatibleProvider.isDashScopeProvider` :

- `bare hostname` → correspondance exacte (insensible à la casse)
- `*.suffix` → correspond au `suffix` lui-même **ET** à tout sous-domaine ; ancré par un point, ce qui rejette les vecteurs d’attaque par typosquatting comme `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld`

Pas d’introduction d’expressions régulières, ni de globbing tenant compte du port ou du schéma – la chaîne dans les paramètres a exactement la sémantique qu’elle affiche.

### 11.4 Différences d’implémentation par rapport à R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

Le wrapper de R1 n’avait que deux portes : telemetry-enabled et sessionId. R3 insère une troisième porte entre les deux :

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
      return baseFetch(input, init); // porte hôte
    }
  }
  const sid = config.getSessionId();
  if (!sid) return baseFetch(input, init);
  // ... injection du header
};
```

`trustedHosts` est capturé en une seule fois lors du wrap (contrairement au session id qui est lu en temps réel à chaque requête). Modifier `telemetry.sessionIdHeaderHosts` en cours de route nécessite de reconstruire le `contentGenerator` pour prendre effet. Les espaces parasites comme `[" * "]` sont traités par `.trim()` pour être considérés comme une diffusion, afin d’éviter qu’une faute de frappe dans `settings.json` entraîne une dégradation silencieuse.

#### `staticCorrelationHeaders` (Gemini)

La signature ajoute un paramètre `destinationUrl?: string` :

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed : si on ne connaît pas la destination, on n’envoie rien
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Intégration dans le factory Gemini

Le SDK Gemini a deux endpoints par défaut invisibles (`generativelanguage.googleapis.com` et `{region}-aiplatform.googleapis.com`, déterminé par `vertexai`), et le factory ne peut pas reconstruire l’un des deux avec certitude. R3 choisit : si `config.baseUrl` n’est pas défini, on transmet `undefined`, et le helper fait fail-closed → aucun header n’est envoyé. Les opérateurs qui souhaitent la corrélation doivent définir explicitement `baseUrl` (qui est la même entrée utilisée par le SDK lui-même pour résoudre la destination). Ce changement évite que la allowlist ne soit incorrectement appliquée après une devinette erronée de la destination Vertex.

### 11.5 Nouveaux fichiers / nouveau code

| Fichier                                                                                             | Description                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (NOUVEAU)                                        | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                                                                                                    |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (NOUVEAU)                                   | Tests unitaires, incluant les vecteurs d’attaque par typosquatting de TLD, fail-closed IPv6, extraction du port/userinfo/query                                                      |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                              | Ajout de la porte hôte ; `staticCorrelationHeaders` ajoute le paramètre `destinationUrl`                                                                                           |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                         | Ajout de 8 cas pour la porte hôte ; `mockConfig` utilise `'hosts' in opts` pour distinguer « allowlist par défaut » de « diffusion »                                               |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`)                                | Transmission de `sessionIdHeaderHosts`                                                                                                                                             |
| `packages/core/src/config/config.ts`                                                                | `TelemetrySettings.sessionIdHeaderHosts` + getter `getTelemetrySessionIdHeaderHosts()`                                                                                             |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                            | Transmission de `config.baseUrl` au helper ; fail-closed quand undefined                                                                                                           |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`                                       | Réécriture des tests telemetry-on Gemini pour correspondre à la nouvelle sémantique fail-closed                                                                                    |
| `packages/cli/src/config/settingsSchema.ts`                                                         | Entrée du schéma JSON pour `sessionIdHeaderHosts`                                                                                                                                  |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                        | Régénéré par `npm run generate:settings-schema`                                                                                                                                    |
| `docs/developers/development/telemetry.md`                                                          | Réécriture de la section « Session correlation header » + portée par défaut + syntaxe de surcharge                                                                                 |

### 11.6 Réponses aux arguments de LaZzyMan

| Argument de LaZzyMan                                    | Réponse de R3                                                                                                                                                                                                                     |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① Étiquetage télémetrie inapproprié                    | **Résolu** : dans le cas d’utilisation DashScope, le header session id est littéralement envoyé au backend ARMS Tracing (même entité juridique), donc la sémantique de `telemetry.enabled` est alignée.                            |
| ② Diffusion d’un identifiant stable cross-vendor       | **Résolu** : l’allowlist par défaut ne contient que les hôtes first-party du groupe Alibaba ; la diffusion devient opt-in (`["*"]`)                                                                                                |
| ③ `traceparent` est un autre canal de la même empreinte | **Provisoirement conservé** : `traceparent` reste injecté comme dans R1. Justification : standard W3C, trace id est un hash sha256, la continuation de trace intra-vendor est un cas d’usage central de W3C. Un toggle par destination pour `traceparent` est listé dans §10 travaux futurs. |

### 11.7 Points connus restants + suivi

- **Portée de `traceparent`** – voir point ③ ci-dessus, listé dans §10
- **UUID aléatoire par requête** (`X-Qwen-Code-Request-Id`) – alternative proposée par LaZzyMan, listée dans §10
- **Invalidation paresseuse du session id stale pour Gemini** (option A du §8.6) – découplé de R3, sous-ticket indépendant
- **Support IPv6 pour `matchesTrustedHost`** – actuellement, une destination IPv6 n’est jamais dans la allowlist (`URL.hostname` renvoie `[::1]` avec crochets, et la syntaxe des patterns n’a pas de forme correspondante). Cela convient pour le cas d’usage « nommer des endpoints first-party ». À étendre si un besoin d’allowlist par adresse IP brute apparaît.

## 12. Révision R4 — Séparation de la confusion de portée

> Déclenché : [revue de suivi round-8 de LaZzyMan sur le PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)  
> Mise en œuvre : ce PR réduit la portée ; l’ensemble du code session-id mis en œuvre dans R3 est déplacé vers un PR de suivi distinct

### 12.1 Déclencheur et justification

R3 a résolu la préoccupation de la première revue de LaZzyMan concernant « la diffusion d’une empreinte stable à des fournisseurs tiers » (sévérité : high). Mais dans la revue de suivi round-8, il a élevé le niveau à un principe d’architecture plus profond :

> « Telemetry n’est pas un conteneur pour des fonctionnalités adjacentes. La propagation cross-process de `traceparent` et l’injection du header `X-Qwen-Code-Session-Id` **ne sont pas de la télémétrie**. Ce sont des travaux d’identification / corrélation sortante qui utilisent certaines API OTel en interne comme détail d’implémentation. »

Son métapropos central :

- **Le namespace « telemetry » sous-entend que le destinataire = le collecteur OTLP de l’utilisateur**
- Mais le destinataire de `traceparent` et `X-Qwen-Code-Session-Id` = **le fournisseur LLM tiers**
- Ces deux types de destinataires devraient avoir deux arbres de décision de consentement distincts
- Même si le comportement par défaut est sûr (déjà mis en œuvre dans R3), placer des comportements de niveau wire sous `telemetry.*` **crée un mauvais précédent** : de futurs PR telemetry pourraient continuer à faire passer en contrebande des comportements wire vers des tiers
- « Si nous acceptons ce principe, la séparation est mécanique. Si nous ne l’acceptons pas, ce PR n’est pas le bon endroit pour en débattre car les correctifs techniques sont déjà en place. »

### 12.2 Résumé de la solution (« plan C » — séparation hybride)

Après plusieurs discussions internes (y compris la proposition d’un template `customHeader` alternatif de yiliang, finalement rejetée car un `customHeader` ne peut pas transporter de valeur dynamique au runtime), il a été décidé de suivre le **plan C** :

**Ce PR conserve** :

- L’enregistrement de `UndiciInstrumentation` (qui produit des spans HTTP client → collector OTLP de l’utilisateur)
- Le garde-fou de boucle de rétroaction OTLP (effet secondaire nécessaire du point précédent)
- **L’installation par défaut de `NoopTextMapPropagator`** → `propagation.inject()` devient no-op → **les `fetch` sortants n’ont plus de `traceparent`**
- **Ajout de `outboundCorrelation.propagateTraceContext: bool` (par défaut false)** en tant que paramètre de niveau supérieur dans un namespace indépendant ; quand il est true, le composite propagator W3C par défaut est installé
- **L’ensemble du code session-id R3** (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / le paramètre `telemetry.sessionIdHeaderHosts` / 4 points d’intégration des fournisseurs / tous les tests associés) **est entièrement supprimé**

**Déplacé vers un PR de suivi** :

- Toute la machinerie du header `X-Qwen-Code-Session-Id` (réutilisation de l’implémentation R3)
- Intégré dans un nouveau namespace `outboundCorrelation.*` (la clé exacte du paramètre reste à définir, mais **ne s’appellera pas** `telemetry.*`)
- Le PR de suivi apportera : une section sur le modèle de menace, une revue indépendante, une documentation marquée comme security-relevant
- Le UUID par requête `X-Qwen-Code-Request-Id` (conception alternative proposée par LaZzyMan durant le round R3) sera également pris en compte dans ce suivi

### 12.3 Correspondance avec les arguments de R1/R3

| Argument de R1/R3                                                         | Statut après R4                                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| §3.1 « Toutes les requêtes LLM sortantes portent `traceparent` »         | ❌ **R4 par défaut désactivé** ; nécessite `outboundCorrelation.propagateTraceContext: true` pour être activé                            |
| §3.1 « Toutes les requêtes LLM sortantes portent `X-Qwen-Code-Session-Id` » | ❌ **R4 supprime complètement l’ensemble de ce PR** ; déplacé vers un PR de suivi                                                      |
| §4.3 wrapper fetch injectant le session id                               | ❌ Le code entier n’est pas dans ce PR ; réutilisé dans le PR de suivi                                                                  |
| §11 allowlist d’hôtes (conception R3)                                    | ❌ Idem ; transféré intégralement dans le PR de suivi                                                                                   |
| §4.4 N’introduire aucun nouveau paramètre                                | ❌ **Ce PR ajoute le booléen `outboundCorrelation.propagateTraceContext`** ; les paramètres liés au session id sont dans le PR de suivi |
| §10 travaux futurs « `X-Qwen-Code-Request-Id` »                         | ✅ Toujours un travail futur ; conçu en même temps que le suivi session-id                                                              |

### 12.4 Intention de conception du nouveau namespace

Le namespace de niveau supérieur `outboundCorrelation.*` n’a dans ce PR qu’un seul booléen (`propagateTraceContext`), ce qui peut sembler excessivement structuré. Mais c’est un **choix délibéré** :

- **Établir le namespace comme une promesse** : permettre aux futurs session-id / request-id / etc. d’entrer naturellement dans ce namespace
- **Marquer comme security-relevant** : la description dans `settingsSchema.ts` mentionne explicitement « SECURITY-RELEVANT », et la documentation le présente comme « paramètre de sécurité » et non comme « paramètre d’observabilité »
- **Tous les defaults à off** : conforme au principe de LaZzyMan selon lequel « un client open source ne doit pas envoyer d’identifiants stables à des tiers sans consentement explicite »
- **Découplé de `telemetry.*`** : l’utilisateur qui lit `settings.json` voit `outboundCorrelation.*` et identifie immédiatement qu’il s’agit d’un comportement wire sortant, et non d’observabilité

#### Dépendance implicite : `telemetry.enabled`

Bien que le namespace soit découplé de `telemetry.*`, **son activation au runtime dépend encore de `telemetry.enabled: true`** – le SDK OTel n’est initialisé que lorsque la télémétrie est activée ; sans SDK, pas d’installation de propagator, pas d’appel à `propagation.inject()`, et le flag reste un no-op silencieux. Piège potentiel : un opérateur met `propagateTraceContext: true` mais oublie d’activer telemetry, et le serveur cible ne voit aucun `traceparent`, sans erreur ni avertissement.

Les deux panneaux destinés à l’utilisateur mentionnent explicitement cette dépendance :

- La section `propagateTraceContext` de `telemetry.md` est accompagnée d’un exemple JSON complet avec les deux flags
- La `description` dans `settingsSchema.ts` commence par la phrase « Requires `telemetry.enabled: true` » (placée en premier pour éviter que l’interface des paramètres de VS Code ne la cache après repli de la description longue)

À l’avenir, si un header session-id ou un autre paramètre `outboundCorrelation.*` est ajouté, **la même règle de dépendance s’applique** – ils n’ont de sens qu’avec la télémétrie activée (car ils sont injectés via l’instrumentation/SDK OTel). Le PR de suivi devra hériter de ce modèle d’avertissement anti-piège.

### 12.5 Mise en œuvre

| Fichier                                                                                               | Modification                                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                                | **Supprimé**                                                                                                                                                                                                                                                   |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                           | **Supprimé**                                                                                                                                                                                                                                                   |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                                                    | **Supprimé**                                                                                                                                                                                                                                                   |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                                               | **Supprimé**                                                                                                                                                                                                                                                   |
| `packages/core/src/telemetry/sdk.ts`                                                                  | + `NoopTextMapPropagator` ; décide le `textMapPropagator` du SDK selon `getOutboundCorrelationPropagateTraceContext()`                                                                                                                                          |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                                   | Suppression de la référence à `wrapFetchWithCorrelation`                                                                                                                                                                                                       |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`                                 | Idem                                                                                                                                                                                                                                                           |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`                       | Idem                                                                                                                                                                                                                                                           |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                              | Suppression de la référence à `staticCorrelationHeaders`                                                                                                                                                                                                       |
| Les `*.test.ts` des 4 fournisseurs ci-dessus                                                          | Suppression des cas de test liés au session-id                                                                                                                                                                                                                 |
| `packages/core/src/config/config.ts`                                                                  | Suppression de `TelemetrySettings.sessionIdHeaderHosts`, `getTelemetrySessionIdHeaderHosts` ; **ajout de l’interface `OutboundCorrelationSettings` + champ `outboundCorrelationSettings` + getter `getOutboundCorrelationPropagateTraceContext()`**            |
| `packages/core/src/telemetry/config.ts`                                                               | Suppression de la transmission de `sessionIdHeaderHosts` dans `resolveTelemetrySettings`                                                                                                                                                                       |
| `packages/cli/src/config/settingsSchema.ts`                                                           | Suppression du schéma `sessionIdHeaderHosts` ; **ajout d’un élément de schéma de niveau supérieur `outboundCorrelation`**                                                                                                                                      |
| `packages/cli/src/config/config.ts`                                                                   | Transmission de `outboundCorrelation: settings.outboundCorrelation` dans `ConfigParameters`                                                                                                                                                                    |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                          | Régénéré par `npm run generate:settings-schema` (la description sera mise à jour ultérieurement)                                                                                                                                                               |
| `docs/developers/development/telemetry.md`                                                            | Réécriture de « Trace context propagation » → « Client-side HTTP span on outbound fetch » ; suppression de toute la section « Session correlation header » ; ajout d’une nouvelle section de niveau supérieur « Outbound correlation (SECURITY-RELEVANT) » ; ajout de la dépendance `telemetry.enabled` + exemple de configuration JSON |
| `docs/design/telemetry-outbound-propagation-design.md`                                                | Cette section + en‑tête R4 + pointeur de révision                                                                                                                                                                                                              |
| `packages/core/src/config/config.test.ts`                                                             | **Ajout d’un bloc `describe` `OutboundCorrelation Configuration`**, `it.each` avec 4 cas pour verrouiller l’invariabilité de sécurité du champ `getOutboundCorrelationPropagateTraceContext` par défaut false (omitted / `{}` / explicit true / explicit false) |

### 12.6 Réponses aux méta-arguments de LaZzyMan

| Argument                                                              | Statut après R4                                                                                                                         |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| « Le namespace Telemetry sous-entend un collecteur utilisateur »      | ✅ Les comportements wire ont été sortis de `telemetry.*` ; le nouveau namespace `outboundCorrelation.*` explicite la sémantique « sortant vers des tiers » |
| « Le comportement par défaut ne doit pas envoyer d’identifiants à des tiers sans consentement explicite » | ✅ `propagateTraceContext` par défaut false ; l’ensemble du PR de suivi session-id sera également désactivé par défaut                   |
| « Un PR telemetry ne doit pas faire passer en contrebande des comportements wire » | ✅ Ce PR n’ajoute plus aucun chemin de code où « telemetry contrôle un comportement wire » ; les comportements wire sont tous gérés par `outboundCorrelation.*` |
| « la séparation est mécanique, le travail n’est pas perdu »          | ✅ Le code mis en œuvre dans R3 est physiquement supprimé de cette branche, mais reste dans l’historique git pour être réutilisé (ou cherry-pick) dans le PR de suivi |
### 12.7 Plan du PR de suivi (informatif, hors scope de ce PR)

Les PR de suivi futurs devraient inclure :

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` ou paramètre similaire
- Réutilisation du squelette de code déjà implémenté dans R3 pour `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`
- Une section sur le modèle de menace, précisant : l'ensemble des destinataires, la fenêtre de désanonymisation des identifiants stables, l'accompagnement optionnel d'un UUID par requête
- **Désactivé par défaut** (aucune liste blanche par défaut — plus strict que R3, conforme au principe CLI open source de LazzyMan)
- Mention « security-relevant » + ajout dans docs/users/configuration/settings.md