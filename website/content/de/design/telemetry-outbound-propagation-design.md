# Telemetry: Outbound Trace Context & Session ID Header Propagation

> Begleit-issue: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Eltern-issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 tiefere Observability)
> Vorhergehender PR: #4367 (Ressourcenattribute – gemerged 2026-05-21, Commit `64401e1`)
> Basierend auf 2026-05-21 des qwen-code main-Branches + direkt verifiziertem claude-code-Quellcode

## Revisionshistorie

| Revision | Datum       | Auslöser                                         | Zusammenfassung                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------- | ----------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1       | 2026-05-21  | Entwurf                                          | Vollausstrahlung: Alle ausgehenden LLM-Anfragen erhalten `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                                                                                                                                                  |
| R2       | 2026-05-22  | wenshao R2/R3 Review                             | Grenzsicherheit: URL-Normalisierung, Port-Matching, Quote-Angleichung, `staticCorrelationHeaders` try/catch, `host:port`-Fallback-Strip                                                                                                                                                                                                                                                                              |
| R3       | 2026-05-23  | LaZzyMan REQUEST_CHANGES                         | **Wesentliche semantische Änderung**: Der Standardanwendungsbereich von `X-Qwen-Code-Session-Id` wird auf eine Whitelist von First-Party-Hosts (Alibaba/DashScope) verengt. Siehe §11                                                                                                                                                                                                                                |
| R4       | 2026-05-25  | LaZzyMan Round-8 Follow-up (Scope-Vermischung)   | **PR-Scope deutlich verkleinert**: Dieser PR behält nur den Client-HTTP-Span + OTLP-Loop-Guard; `traceparent` standardmäßig deaktiviert (NoopTextMapPropagator); neuer übergeordneter Namespace `outboundCorrelation.*` für sicherheitsrelevante Toggle; die in R3 umgesetzte Maschine für `X-Qwen-Code-Session-Id` wird **aus diesem PR entfernt** und in einen separaten Follow-up-PR verschoben. Siehe §12 |

**Besonderer Hinweis**: Beim Lesen von §3.1 (Ziele) / §3.2 (Nicht-Ziele) / §4.3 (Part B-Entwurf) / §4.4 (Auswirkungen auf Konfigurationsschema) / §5 (Liste der Dateiänderungen) / §9 (Vergleich mit claude-code) / §10 (Zukünftige Arbeiten) / §11 (R3 Host-Allowlist-Scoping) beachten Sie bitte §12 – **Die Revision R4 hebt die Aussagen von R1-R3 auf, dass „dieser PR gleichzeitig traceparent + session id header umsetzt“ nicht mehr gültig**: Dieser PR ist jetzt nur Telemetry-Observability + ein eigenständiger Outbound-Trace-Context-Toggle; sämtliche Arbeiten an ausgehenden Korrelations-Headern (einschließlich der Host-Whitelist aus R3) werden vollständig in einen separaten Follow-up-PR verschoben. Die in R3 geleistete Code-Arbeit ist nicht umsonst, sie wird im Follow-up-PR wiederverwendet.

## 1. Hintergrund

#4367 hat die **Attribute und Kardinalität auf emittierter Telemetrie** gelöst (Betreiber können Span/Log/Metric mit `user.id`/`tenant.id` etc. versehen). Aber eine Sache hat es nicht angefasst: **HTTP-Header von ausgehenden LLM-Anfragen**. Heute senden qwen-code-Anfragen an DashScope / OpenAI / Gemini / Anthropic **überhaupt keine Cross-Process-Korrelationsheader** – weder W3C `traceparent` noch eine Session-ID.

Folgen:

1. Der Trace-Context wird an der Prozessgrenze von qwen-code unterbrochen. Wenn der Modellservice (z. B. DashScope mit ARMS Tracing-Integration) selbst eine OTel-Instrumentierung besitzt, sind die erzeugten Spans unabhängig von qwen-code-Traces; ein Ende-zu-Ende-Trace-Baum existiert nicht.
2. Keine Session-ID auf der Leitung. Das Backend müsste qwen-code-Metriken/Logs mit Server-Logs offline über Trace-ID oder Zeitstempel verknüpfen – weitaus weniger einfach als direkt den Header zu lesen.
3. Lokaler Trace fehlt eine Client-seitige HTTP-Span-Ebene. Heute kann man nur die Gesamtlaufzeit von `api.generateContent` sehen, nicht die Netzwerk-TTFB / Antwortkörpergröße / Anzahl der Wiederholungen.

## 2. Aktueller Stand

### 2.1 Nur `HttpInstrumentation` aktiviert

`packages/core/src/telemetry/sdk.ts:330`:

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` hookt nur die in Node integrierten `http`/`https`-Module, **nicht** den `globalThis.fetch`-/undici-Pfad.

### 2.2 Beide LLM-SDKs nutzen fetch / undici

| SDK                                              | HTTP-Implementierung                                                                                                                   | Wird `HttpInstrumentation` gecovered? |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ entspricht undici). Beleg: `node_modules/openai/internal/shims.mjs` Fehler `'fetch' is not defined as a global` | ❌                                    |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Beleg: `new Headers()`-Aufruf in `dist/node/index.mjs`                                            | ❌                                    |
| `@anthropic-ai/sdk` (anthropicContentGenerator)  | Ebenfalls fetch-basiert                                                                                                                 | ❌                                    |

### 2.3 Keine manuelle Propagation im Codebase

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Leer. Kein `propagation.inject()`-Aufruf, keine manuelle traceparent-Injektion.
### 2.4 Aktueller Stand von `defaultHeaders` pro Provider

OpenAI-Familie (mit `openai` SDK):

Alle OpenAI-Sub-Provider `extends DefaultOpenAICompatibleProvider`. Das **`buildHeaders`-Override-Verhalten gliedert sich in zwei Kategorien** (durch grep-Audit verifiziert):

| Provider     | Datei                   | Verhalten von `buildHeaders()`                                                                                        | Auswirkung                                                           |
| ------------ | ----------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Basisklasse  | `default.ts:63-74`      | Stellt `{ 'User-Agent' }` + customHeaders bereit                                                                      | Ändere hier                                                          |
| DashScope    | `dashscope.ts:110-124`  | **`override` aber ruft `super` nicht auf** – gibt ein neues Objekt `User-Agent` + `X-DashScope-*` zurück              | **Muss separat hier geändert werden**, sonst geht der Correlation-Header verloren |
| OpenRouter   | `openrouter.ts:20-30`   | `override` aber **zuerst `const baseHeaders = super.buildHeaders()`**                                                 | Änderung der Basisklasse wird automatisch vererbt ✅                 |
| DeepSeek     | `deepseek.ts`           | Überschreibt `buildHeaders` nicht (überschreibt nur `buildRequest` / `getDefaultGenerationConfig`)                     | Automatische Vererbung ✅                                             |
| Minimax      | `minimax.ts`            | Wie DeepSeek                                                                                                          | Automatische Vererbung ✅                                             |
| Mistral      | `mistral.ts`            | Wie DeepSeek                                                                                                          | Automatische Vererbung ✅                                             |
| ModelScope   | `modelscope.ts`         | Wie DeepSeek                                                                                                          | Automatische Vererbung ✅                                             |

→ **OpenAI-Familie benötigt Änderungen in 2 Dateien**: `default.ts` und `dashscope.ts`. Die restlichen 5 erben automatisch.

**Google Gemini**:

| Provider | Datei                           | Header-Injektionspfad                               |
| -------- | ------------------------------- | --------------------------------------------------- |
| Gemini   | `geminiContentGenerator.ts:59`  | `new GoogleGenAI({ httpOptions: { headers } })` – SDK-native Unterstützung |

**Anthropic**:

| Provider  | Datei                                                                                              | Header-Injektionspfad |
| --------- | -------------------------------------------------------------------------------------------------- | --------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders`-Argument für `new Anthropic`) | `defaultHeaders`      |

**Insgesamt 4 SDK-Konstruktionspunkte** erfordern die Injektion des Session-ID-Headers. Alle SDKs unterstützen bereits `defaultHeaders` / `httpOptions.headers`, ein fetch-Wrapper ist nicht erforderlich.

### 2.5 Bestehende Proxy- und Fetch-Konfiguration

`provider/default.ts:87-89`:

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` gibt bei konfiguriertem Proxy `{ fetch: customFetch }` oder Ähnliches zurück und löst `setGlobalDispatcher(new ProxyAgent(...))` aus (siehe `config.ts:1126-1128`). **Der globale Undici-Dispatcher-Modus ist mit `UndiciInstrumentation` kompatibel** – er arbeitet mit den Channel-Diagnostics von undici durch Monkey-Patching von `globalThis.fetch` zusammen, ohne von einem bestimmten Dispatcher abhängig zu sein.

## 3. Ziele / Nicht-Ziele

### 3.1 Ziele

- Alle ausgehenden LLM-Anfragen erhalten automatisch den W3C-`traceparent`-Header (standardmäßiger `W3CTraceContextPropagator` des OTel SDK)
- ~~Alle~~ ausgehenden LLM-Anfragen erhalten den `X-Qwen-Code-Session-Id`-Header (gleicher Produktnamespace wie claude-code) — **R3-Überarbeitung**: Standardmäßig nur an First-Party-Hosts (Alibaba/DashScope) injiziert, Drittanbieter-Provider erhalten ihn standardmäßig nicht; siehe §11
- Automatische Vermeidung von Traces für den OTLP-Exporter-Endpoint selbst (Feedback-Schleife)
- Hinzufügen eines präzisen Client-Spans für LLM-Anfragen (Trennung von Netzwerklatenz und Modellverarbeitungszeit)
- Abdeckung der 4 Provider-Konstruktionspunkte: OpenAI-Basisklasse, DashScope-Override, Gemini, Anthropic
- Streaming-Anfragen / Proxy-Modus / Wiederholungsszenarien verschlechtern sich nicht
- Übereinstimmung mit der Designphilosophie von #4367: Verwendung von `defaultHeaders`, einer SDK-nativen Option — **R1-Überarbeitung**: Aufgrund von Staleness-Problemen auf fetch-Wrapper umgestellt; **R3-Überarbeitung**: Im fetch-Wrapper zusätzlich eine Host-Gate-Ebene hinzugefügt

### 3.2 Nicht-Ziele

- **`baggage`-Header**: Standardmäßig vom SDK unterstützt, aber qwen-code ruft `propagation.setBaggage()` nicht auf, daher wird es standardmäßig nicht gesendet. Dieses Design aktiviert es nicht aktiv.
- **Subprozess-`TRACEPARENT`-Umgebungsvariablen-Vererbung**: claude-code injiziert `TRACEPARENT` in Bash/PowerShell-Subprozesse. Der `BashTool` von qwen-code macht das nicht. Ist ein separates Follow-up-Sub-Issue.
- **Einlesen von eingehenden `TRACEPARENT` / `TRACESTATE`**: Der `-p`-Modus von claude-code und das Agent SDK lesen traceparent aus der Umgebung, um den Trace des Elternprozesses fortzusetzen. qwen-code macht das nicht. Separates Follow-up.
- **`X-Qwen-Code-Request-Id`**: claude-code hat `x-client-request-id`, nützlich für Timeout-Resilienz-Korrelation. In diesem Issue nicht enthalten, kann als nächstes Sub-Issue bearbeitet werden.
- **Benutzerdefinierter Propagator (B3 / Jaeger / X-Ray)**: Standardmäßig deckt W3C 99% der Szenarien ab. Kann als zukünftige Konfigurationsoption hinzugefügt werden.
- ~~**Per-Endpunkt-selektive Injektion**: claude-code sendet keinen traceparent an Drittanbieter-Endpunkte (Bedrock / Vertex); qwen-code benötigt keine Unterscheidung nach Drittanbietern, kann einheitlich gesendet werden.~~ — **R3-Überarbeitung**: Diese Annahme wurde widerlegt. Das LaZzyMan-Review zeigt, dass qwen-code eine Open-Source-CLI ist, die mehrere Drittanbieter-Provider (OpenAI / Anthropic / OpenRouter / etc.) verbindet. Die First-Party→First-Party-Analogie von claude-code ist nicht anwendbar; der Session-ID-Header muss nach Host unterschieden werden. Siehe §11. `traceparent` wird weiterhin gemäß R1-Design vollständig injiziert (OTel-Standardheader, und die Trace-ID ist ein `sha256(sessionId)`-Hash), kann als separates Follow-up mit einem Per-Destination-Toggle (`telemetry.propagateTraceContext`) versehen werden.

## 4. Design

### 4.1 Gesamtschichtung

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
   ... (bestehende User-Agent, X-DashScope-*, etc.)
```
Zwei Injektionspfade sind unabhängig und voneinander unabhängig:

| Layer                    | Wann wird injiziert                | Wer injiziert                                                   |
| ------------------------ | ---------------------------------- | --------------------------------------------------------------- |
| `traceparent`            | Bei jedem `fetch`-Aufruf           | `UndiciInstrumentation` automatisch (via OTel SDK Standard-Propagator) |
| `X-Qwen-Code-Session-Id` | Einmalig beim SDK-Aufbau in `defaultHeaders` | Anwendungscode                                              |

### 4.2 Teil A – `traceparent` via undici-Instrumentation

**Änderungspunkt**: `packages/core/src/telemetry/sdk.ts`

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

#### Warum `ignoreRequestHook` notwendig ist

Das OTel SDK verwendet selbst fetch, um Daten per POST an den OTLP-Collector zu senden. Ohne Ausnahme würde UndiciInstrumentation auch für diese „Melde-Requests“ einen Span erzeugen → dieser neue Span würde erneut gemeldet → Endlosschleife / enormes Rauschen. Jedes OTel-Projekt ist über diese Hürde gestolpert, die OTel-Dokumentation empfiehlt diesen Hook ausdrücklich.

#### Standard-Propagator

Wenn dem OTel SDK `NodeSDK` kein `textMapPropagator` übergeben wird, ist standardmäßig `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])` aktiv. Eine explizite Angabe ist nicht erforderlich.

#### `traceparent`-Format

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               Version (fest 00)                            Flags
```

Feste 55 Bytes, kein Padding.

#### `tracestate` und `baggage`

- `tracestate`: Wird nur weitergegeben, wenn es vom Vorgänger kommt; eigene Injektion fügt es nicht aktiv hinzu (OTel SDK-Verhalten).
- `baggage`: Nur vorhanden, wenn `propagation.setBaggage(ctx, ...)` aufgerufen wurde. Wird von qwen-code nicht aufgerufen, daher nicht gesendet.

### 4.3 Teil B – `X-Qwen-Code-Session-Id` via fetch-Wrapper (OpenAI / Anthropic) + static headers (Gemini)

> **R3-Überarbeitung**: Die folgende Beschreibung bezieht sich auf die Staleness-Lösung des fetch-Wrappers und die vier Provider-Integrationspunkte – diese bleiben erhalten. Im Wrapper wurde jedoch ein Host-Allowlist-Gate eingeführt, und `staticCorrelationHeaders` erhielt einen `destinationUrl`-Parameter. Der aktuelle Code mit Host-Gate und der Standard-Allowlist befindet sich in §11.

#### Kritisch: Staleness-Problem und Lösungsauswahl

Der naive Ansatz (`defaultHeaders` backt `getSessionId()` direkt ein) hat einen **echten Bug**:

1. `pipeline.ts:60` erstellt den Client bei der Konstruktion des contentGenerators einmalig mit `this.client = this.config.provider.buildClient()`, die `defaultHeaders` des SDK-Clients erfassen dabei die aktuelle Session-ID.
2. `config.ts:1850` aktualisiert bei einem Session-Reset (ausgelöst durch `/clear` des Benutzers) `this.sessionId` und ruft `refreshSessionContext()` auf, **erstellt contentGenerator aber nicht neu**.
3. Nachfolgende LLM-Aufrufe verwenden weiterhin den alten Client → der Wire-Header enthält die alte Session-ID → Korrelationsfehler auf der Backend-Seite.

→ Die Session-ID muss **pro Request** ausgelesen werden, nicht beim Konstruktor gebackt.

#### Lösung

```
                   ┌─ fetch-Unterstützung ─┐   Lösung
OpenAI SDK          │         ✅             │ fetch-Wrapper (liest Session-ID per Request) ✅
Anthropic SDK       │         ✅             │ fetch-Wrapper ✅
@google/genai SDK   │         ❌             │ statische httpOptions.headers + Staleness akzeptieren
                   └─────────────────────────┘
```

`@google/genai`’s `HttpOptions`-Interface unterstützt kein `fetch` (durch `grep` in `node_modules/@google/genai/dist/genai.d.ts` verifiziert: nur `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Daher verwendet Gemini statische Header, was nicht mit OpenAI/Anthropic übereinstimmt – dies ist ein **bekanntes Limitation**, siehe §8.6.

#### Zentrale Hilfsfunktion (fetch-Wrapper pro Request)

Neue Datei `packages/core/src/telemetry/llm-correlation-fetch.ts`:

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
Begleithilfe für die SDKs, die nur statische Header akzeptieren (Gemini):

```ts
/**
 * Statische Korrelations-Header. Erfasst die Session-ID zum Zeitpunkt des Aufrufs —
 * **unterliegt Veralterung**, wenn das Host-SDK diese Header in einem bei der
 * Konstruktion erfassten Slot speichert (z.B. `@google/genai`'s `httpOptions.headers`).
 * Bevorzugen Sie `wrapFetchWithCorrelation`, wenn das SDK einen `fetch`-Hook bereitstellt.
 */
export function staticCorrelationHeaders(
  config: Config,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  return { 'X-Qwen-Code-Session-Id': config.getSessionId() };
}
```

#### Integrationspunkt 1: `provider/default.ts` (OpenAI-Basisklasse)

`buildClient()`-Änderung – Komposition des vorhandenen `runtimeOptions.fetch` (Proxy) mit unserem Wrapper:

```ts
buildClient(): OpenAI {
  // ... existierend ...
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
    // Nach Spread wird `fetch` überschrieben, sodass unser Korrelationswrapper den
    // proxy-bewussten Fetch (oder globalThis.fetch ohne Proxy) umschließt.
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` selbst unverändert.

#### Integrationspunkt 2: `provider/dashscope.ts` (Überschreibung)

`buildClient()` mit demselben Kompositionsmuster (überschreibt ohnehin `buildClient`). `buildHeaders()` bleibt unverändert.

#### Integrationspunkt 3: `geminiContentGenerator/index.ts` (Factory, NICHT Konstruktor)

**Korrektur der vorherigen Überspezifikation**: Der Konstruktor von `geminiContentGenerator.ts` benötigt **keine** Signaturänderung. Die Factory-Funktion in `index.ts:48` erhält bereits `gcConfig: Config` (Zeile 33 verwendet bereits `gcConfig?.getUsageStatisticsEnabled()`). Es müssen lediglich in der Factory die statischen Korrelations-Header in `httpOptions.headers` eingefügt werden:

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... existierend x-gemini-api-privileged-user-id ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← Neu
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) unverändert
```

Null Signaturänderungen.

#### Integrationspunkt 4: `anthropicContentGenerator.ts`

Das Anthropic-SDK akzeptiert ebenfalls einen benutzerdefinierten `fetch` (wird bereits mit `buildRuntimeFetchOptions` verwendet). Umschließen Sie den Fetch im `buildClient`-Pfad wie bei OpenAI default.ts. `buildHeaders` bleibt unverändert.

#### Prioritätskette

Unverändert: Die `customHeaders` des Benutzers gewinnen weiterhin im `defaultHeaders`-Merge (siehe §8.2 Spoofing-Diskussion). Der per Fetch-Wrapper injizierte `X-Qwen-Code-Session-Id` wird *nach* der Header-Liste des SDKs an das finale `Headers`-Objekt angehängt – gemäß Node `Headers.set()`-Semantik überschreibt dies jeden vorherigen gleichnamigen Header (einschließlich des gleichnamigen Headers in den `customHeaders` des Benutzers).

**Für OpenAI/Anthropic (Fetch-Wrapper-Pfad)**: Korrelation > customHeaders > SDK-Standards.
**Für Gemini (Statische-Header-Pfad)**: customHeaders > Korrelation > SDK-Standards (bestehende Spread-Reihenfolge beibehalten).

Der Unterschied besteht darin, dass Spoofing unter dem Fetch-Wrapper-Pfad nicht mehr möglich ist (der Fetch-Wrapper läuft nach den SDK-Headern). Dies ist ein **Nebenprodukt der Fehlerbehebung**, keine beabsichtigte Verschärfung – aber sicherer. In §8.2 explizit erwähnen.

### 4.4 Auswirkungen auf das Konfigurationsschema

~~**Fast null**. Dieses Design führt keine neue Einstellung ein~~ — **R3-Überarbeitung**: Eine neue Einstellung `telemetry.sessionIdHeaderHosts: string[]` wurde eingeführt, um die standardmäßige Whitelist der First-Party-Hosts zu überschreiben. Das Schema-Element wurde in `packages/cli/src/config/settingsSchema.ts` hinzugefügt; Beschreibung und Überschreibungssyntax (`["*"]` für Broadcast-Wiederherstellung / `[]` für vollständige Deaktivierung / benutzerdefiniertes Array) siehe §11. Der folgende Text gilt nur für Versionen vor R3:

- `traceparent`-Injektion wird durch aktivierte Telemetrie ausgelöst (bereits vorhandener Schalter)
- `X-Qwen-Code-Session-Id`-Injektion wird ebenfalls durch aktivierte Telemetrie ausgelöst
- Die `ignoreRequestHook`-OTLP-URL wird bereits aus der vorhandenen Konfiguration gelesen

Zukünftig mögliche Einstellungen (**außerhalb des Geltungsbereichs**):

- `telemetry.outboundCorrelationHeader`: Benutzerdefinierter Header-Name (Standard `X-Qwen-Code-Session-Id`)
- `telemetry.outboundPropagationDisabled`: Globale Deaktivierung (falls der LLM-Dienst strikt gegenüber unbekannten Headern ist)
- ~~pro-Destination-Header-Scope-Umschalter~~ — **R3 bereits umgesetzt**, siehe §11

## 5. Dateiänderungsliste

| Datei                                                                           | Änderungstyp | Beschreibung                                                                                                                                                            |
| ------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                    | Abhängigkeit hinzufügen | `@opentelemetry/instrumentation-undici`                                                                                                                                 |
| `packages/core/src/telemetry/sdk.ts`                                            | Ändern       | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                          |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                          | Neue Datei   | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (Gemini-Fallback)                                                                        |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`             | Ändern       | `buildClient()` in `new OpenAI({...})` fügt `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)` hinzu                                                               |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`           | Ändern       | Gleiches (überschreibt `buildClient`)                                                                                                                                   |
| `packages/core/src/core/geminiContentGenerator/index.ts`                        | Ändern       | In der Factory-Funktion wird `staticCorrelationHeaders(gcConfig)` in `httpOptions.headers` eingefügt (**Aufrufer hat bereits Config, null Signaturänderung** — Korrektur der vorherigen Überspezifikation) |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts` | Ändern       | Im `buildClient`-Pfad wird `wrapFetchWithCorrelation` verwendet, um die `fetch`-Option des SDKs zu umschließen                                                           |
**Explizit auditiert, aber keine Änderungen erforderlich** (um zu vermeiden, dass der Reviewer vermutet, dass Pfade fehlen):

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`, verwendet `DashScopeOpenAICompatibleProvider`, **erbt automatisch die buildClient-Änderungen aus dashscope.ts**. Alle Qwen-OAuth-Abläufe profitieren ebenfalls.
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — Wrapper-Modus, konstruiert keinen SDK-Client (es wrappt andere contentGeneratoren für Telemetrie-Logging), keine Änderungen erforderlich.
- `packages/core/src/core/contentGenerator.ts` — Factory-Einstieg, hält keinen Client.
  | `packages/core/src/telemetry/sdk.test.ts` | Änderung | Hinzufügen der Undici-Instrumentation-Registrierung + `ignoreRequestHook`-Test |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | Neue Datei | Unit-Tests für Telemetrie-Ein/Aus-Verhalten + pro-Request-Lesen der `sessionId` (kritisch: nach Session-Reset liest der gewrappte Fetch die neue ID) |
  | `*.test.ts` der Provider | Änderung | Assertion, dass bei SDK-Konstruktion die `fetch`-Option die gewrappte Version ist (OpenAI/Anthropic); Assertion, dass bei Gemini-Konstruktion `httpOptions.headers` den Header `X-Qwen-Code-Session-Id` enthält |
  | `docs/developers/development/telemetry.md` | Änderung | Neuer Abschnitt „Trace-Kontext & Session-Korrelationspropagation“ |
  | `docs/design/telemetry-outbound-propagation-design.md` | Diese Datei | Design-Dokument |

## 6. Aufteilung in PRs

Aufgeteilt in zwei PRs (review-freundlich; können auch zusammengefasst werden, Umfang erlaubt es):

### PR 1 – Automatische `traceparent`-Injektion (strukturell)

- Abhängigkeit `@opentelemetry/instrumentation-undici` hinzufügen
- `sdk.ts`: `UndiciInstrumentation` + `ignoreRequestHook` hinzufügen
- Tests: SDK-Registrierung, OTLP-Endpunkt wird nicht getracet
- Dokumentationsfragmente

**Risiko**: Niedrig. Additiv. Vorhandene Client-Spans sind ein Netto-Gewinn, ändern keine bestehende Span-Struktur.

### PR 2 – `X-Qwen-Code-Session-Id`-Header (mit Hilfsfunktion)

- Neue Datei `llm-correlation-headers.ts`
- Integration in 4 Provider
- Tests: Assertion, dass der Header bei jedem Provider vorhanden ist; bei deaktivierter Telemetrie nicht gesendet wird
- Dokumentationsfragmente

**Risiko**: Niedrig–Mittel. Vorsicht bei der Erweiterung der Konstruktorsignatur von `geminiContentGenerator`, da dies Aufrufer betreffen könnte.

### PR 3 (optional) – Dokumentation + E2E-Überprüfung

- Abschnitt in `telemetry.md` vervollständigen
- E2E-Überprüfungsskript hinzufügen (Muster von `/tmp/verify-telemetry-pr-4367.mjs` wiederverwenden): tatsächlichen Fetch ausführen + Header erfassen

Kann auch in PR 2 integriert werden.

### Reihenfolge-Präferenz

PR 1 und PR 2 sind technisch **unabhängig voneinander** – teilen keinen Code. Dennoch **empfohlen, PR 1 zuerst zu mergen**:

- `traceparent` ist ein **OTel-Standard**-Header, der von jedem OTel-fähigen Collector/Backend sofort erkannt wird → sofortiger Nutzen für den Benutzer
- `X-Qwen-Code-Session-Id` ist ein **produktspezifischer** Header, der erst durch Backend-Konfiguration nutzbar wird → nachgelagerter Nutzen
- Falls PR 2 lange reviewt wird, ist mit PR 1 bereits ein Cross-Process-Trace möglich
- PR 1 ist additive strukturell (niedriges Risiko) und eignet sich gut, um Vertrauen aufzubauen

## 7. Testplan

### 7.1 Unit-Tests für `sdk.ts`

- ✅ `UndiciInstrumentation` ist in den `instrumentations` von `NodeSDK` vorhanden
- ✅ `ignoreRequestHook` gibt `true` für `https://collector:4318/v1/traces` zurück
- ✅ `ignoreRequestHook` gibt `false` für `https://dashscope.aliyuncs.com/...` zurück
- ✅ Sowohl mit als auch ohne abschließenden Schrägstrich korrekt erkannt

### 7.2 Unit-Tests für `llm-correlation-fetch.ts`

**`wrapFetchWithCorrelation`**:

| Szenario                                                                 | Erwartung                                                                                              |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `getTelemetryEnabled() === false`                                        | gewrappter Fetch = baseFetch (keine Header hinzugefügt)                                                |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"                  | gewrappter Fetch enthält in den init.headers `X-Qwen-Code-Session-Id: abc-123`                         |
| `init.headers` enthält bereits `X-Qwen-Code-Session-Id: spoof`           | Wrapper überschreibt mit echter sessionId (Fetch-Wrapper-Pfad erlaubt kein Spoofing, §8.1)             |
| **Session-Reset, dann erneuter Aufruf des gewrappten Fetch**             | **Liest neue sessionId** (Regressionsschutz für Veralterungsfix)                                       |
| baseFetch lehnt ab                                                       | Wrapper gibt den Reject unverändert weiter                                                             |

**`staticCorrelationHeaders`** (Gemini-Pfad):

| Szenario                                                    | Erwartete Rückgabe                                                |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                           | `{}`                                                              |
| `getTelemetryEnabled() === true`, sessionId = "abc-123"     | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                         |
| sessionId enthält Unicode (`會話-1`)                         | Unverändert zurück – HTTP-Header-Wert wird vom SDK kodiert        |
| sessionId ist leerer String                                 | `{ 'X-Qwen-Code-Session-Id': '' }` – Geschäftsinvariante, wird hier nicht geprüft |

### 7.3 Integrationstests pro Provider

Bei jedem Provider in `buildHeaders()` / Konstruktionstest hinzufügen:

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

### 7.4 E2E-Überprüfung (tmux + lokaler HTTP-Server)

⚠️ **Nicht** `globalThis.fetch` mocken, um Header zu erfassen: `UndiciInstrumentation` hakt über den Diagnostics-Channel von undici ein; das Monkey-Patching von `globalThis.fetch` könnte die Instrumentation vollständig umgehen (abhängig von der Patch-Reihenfolge), sodass die `traceparent`-Injektion nicht testbar ist. **Korrekt ist**, einen lokalen HTTP-Server zu starten, den SDK echte Anfragen senden zu lassen und die empfangenen Header serverseitig zu protokollieren.
写一个模仿 `/tmp/verify-telemetry-pr-4367.mjs` 的 Skript:

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` starte einen lokalen Server
2. Starte Telemetrie + outfile + setze die `baseURL` des OpenAI SDK auf `http://127.0.0.1:<port>` (oder verwende einen Mock-Provider, der das SDK tatsächlich einen fetch ausführen lässt)
3. Löse einmal `client.chat.completions.create(...)` aus (dazu ist eine minimal auswertbare Mock-Antwort nötig, sonst schlägt das SDK-Parsing fehl – der lokale Server kann eine gültige, aber leere OpenAI-Antwort zurückgeben)
4. Stelle fest, dass `capturedHeaders[0]` sowohl `traceparent: 00-...` als auch `X-Qwen-Code-Session-Id: <sessionId>` enthält
5. Starte einen weiteren OTLP Collector-Mock auf einem anderen Port und verifiziere, dass die an ihn gesendeten OTLP-Meldungen **keine** `traceparent`-Injektion auslösen (Überprüfung von `ignoreRequestHook`)
6. **Zusätzlich: Staleness-Validierung** – sende Request 1 → rufe `config.resetSession(...)` auf → sende Request 2 → stelle fest, dass `X-Qwen-Code-Session-Id` von Request 2 eine neue Session-ID ist (**das ist der entscheidende Regressionstest für Fix #1**)

### 7.5 Regressionsschutz

- Der fetch eines Streaming-Chat-Completions (mit `stream: true`) wird immer noch ordnungsgemäß geschlossen – `UndiciInstrumentation` hatte in der Vergangenheit Bugs im Span-Lebenszyklus von Streaming-Responses. **Bei der Implementierung muss tatsächlich ein Streaming-Completion Ende-zu-Ende getestet werden**, um zu prüfen, dass der Client-Span ordentlich beendet wird, kein Span ausläuft und der Stream nicht abgeschnitten wird. Es wird nicht davon ausgegangen, dass eine bestimmte Version den Fehler bereits behoben hat.
- Proxy-Modus (`ProxyAgent`) zusammen mit Instrumentierung – `ignoreRequestHook` matcht weiterhin auf den Endpoint-String, der Proxy hat keinen Einfluss.
- Bei Wiederholungen (`maxRetries`) erhält jeder erneute Versuch einen eigenen Client-Span, aber alle teilen sich denselben `traceparent`-Parent (idealerweise wären Wiederholungen mehrere Child-Spans unter einem gemeinsamen Parent-Span – dieser Teil wird durch das SDK-Verhalten bestimmt und ist in diesem Design nicht erzwungen).

## 8. Randfälle / Grenzfälle

### 8.1 Inkonsistentes Verhalten bei customHeaders-Override und Spoofing

Das Spoofing verhält sich auf verschiedenen Provider-Pfaden **unterschiedlich** (Design-Konsequenz, nicht beabsichtigte Verschärfung):

| Provider-Pfad                           | Spoofing möglich? | Grund                                                                                                                                                |
| --------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAI / Anthropic (fetch-wrapper-Pfad) | ❌ Nicht möglich  | Der fetch-wrapper überschreibt `headers.set('X-Qwen-Code-Session-Id', ...)` *nach* der SDK-Header-Liste und überschreibt damit den gleichnamigen customHeaders-Eintrag |
| Gemini (Static-Headers-Pfad)            | ✅ Möglich        | Merge-Reihenfolge `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }` – `customHeaders` gewinnt zuletzt                                    |

claude-code verwendet ebenfalls den fetch-wrapper-Pfad und verhält sich wie OpenAI/Anthropic (Spoofing nicht möglich). Dies ist ein Nebeneffekt der Behebung des Staleness-Bugs und nicht das ursprüngliche Ziel.

**Es ist nicht beabsichtigt, die beiden Pfade "anzugleichen"** – das Verhalten des Gemini-Pfads ist eine SDK-Einschränkung (kein `fetch`-Hook), und es wäre unvernünftig, OpenAI ebenfalls auf den statischen Pfad herabzustufen.

Session-ID-Spoofing ist keine echte Bedrohung (der Benutzer kontrolliert die lokale Umgebung und kann den Quellcode direkt ändern). In der Dokumentation muss dieser Unterschied klar kommuniziert werden, damit Reviewer nicht die Priorität von `customHeaders` in Frage stellen, wenn der fetch-wrapper-Pfad kein Spoofing erlaubt.

### 8.2 Zwei Arten von Randfällen bei der OTLP-Collector-URL-Übereinstimmung

#### (a) Auth-Token in der URL

Wenn der OTLP-Endpoint des Benutzers die Form `https://collector/path?token=secret` hat, vergleicht `ignoreRequestHook` mit `url.startsWith(e)` den gesamten String inklusive Query-String. Allerdings liefert `undici` für `request.path` nur den Pfad (ohne Query). Daher wird beim Vergleich auch nur der Pfadteil von `e` verwendet. Zur Sicherheit sollte die Query entfernt werden:

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) Theoretischer false positive durch startsWith über Hostnamen-Grenzen

Wenn `e = "http://collector"` (ohne Port) ist, würde eine eingehende URL `http://collector-fake/v1/traces` fälschlicherweise durch `startsWith` matchen.

**Die tatsächliche Auslösewahrscheinlichkeit ist extrem gering**:

- OTLP-Endpoints haben fast immer einen Port (4317 gRPC / 4318 HTTP), die Form `http://collector:4318` erlaubt keine Verlängerung wie `-fake` (nach dem Port folgt ein `/`)
- Wenn der Benutzer einen Endpoint ohne Port angibt, ist das eine Konfigurationsfehler, und das SDK würde ohnehin auf den Standard-Port zurückfallen

**Zur Härtung** könnte man URL-Origin und Path getrennt vergleichen, anstatt rohes `startsWith` zu verwenden:

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

Dies wird in dieser Iteration nicht umgesetzt – der Aufwand ist unnötig, da der false positive in der Praxis nicht auftritt.

### 8.3 Gemini im Vertex AI-Modus

`@google/genai` unterstützt den `vertexai: true`-Modus (verwendet GCP-Anmeldeinformationen und geht zum Vertex-Endpunkt statt zum generative-ai-Endpunkt). Beide Modi verwenden fetch, daher wird die Instrumentierung in beiden Fällen angewandt. `httpOptions.headers` funktioniert in beiden Modi.

### 8.4 Anthropic SDK hat bereits `defaultHeaders`-Logik

`anthropicContentGenerator.ts:177` ruft bereits `buildHeaders()` auf und übergibt das Ergebnis an `new Anthropic({ defaultHeaders })`. Der Staleness-Effekt gilt jedoch gleichermaßen – dieses Design wechselt zum fetch-wrapper-Pfad (wie bei OpenAI).

### 8.5 Trailer-Header zwischen SDK und fetch

Das `openai` SDK kann bei Streaming `Transfer-Encoding: chunked` und Trailer-Header verwenden. Diese beeinflussen jedoch nicht die request-bezogene Injektion von `traceparent` / `X-Qwen-Code-Session-Id` – beide sind Request-Header, die einmalig beim Absetzen geschrieben werden.

### 8.6 ⚠️ Bekannte Einschränkung: Session-ID von Gemini ist nach `/clear` veraltet

Da das `@google/genai` SDK keinen `fetch`-Hook unterstützt (die `HttpOptions`-Schnittstelle hat nur `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`), verwendet der Gemini-Provider den statischen `httpOptions.headers`-Pfad – die Session-ID wird bei der SDK-Konstruktion erfasst und **nach `/clear` (Session-Reset) nicht aktualisiert**.

**Tatsächliche Auswirkung**:

- Der Benutzer startet qwen-code → führt `/clear` aus → verwendet ein Gemini-Modell → auf der Leitung steht immer noch die alte Session-ID in `X-Qwen-Code-Session-Id`
- Backend-Korrelation ist versetzt (Trace-ID und Logs sind bereits auf die neue Session umgeschaltet, aber der Wire-Header hinkt hinterher)

**Warum wird es nicht behoben** (in dieser Iteration)?

- Der OpenAI-/Anthropic-Pfad hat **diesen Fehler nicht** (fetch-wrapper-Pfad liest die Session-ID pro Request neu aus)
- Der Fix-Pfad für Gemini hat mehrere Optionen, die alle den Scope dieser Iteration sprengen

**Zukünftige Fix-Optionen** (nach empfohlener Reihenfolge):

| Option                                         | Beschreibung                                                                            | Aufwand                                                                                 |
| ---------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **A. Lazy invalidate** ★ Empfohlen             | Beim Session-Reset den contentGenerator nur als "dirty" markieren und bei nächstem LLM-Aufruf lazy neu erstellen | Gering: ~10 Zeilen in `resetSession` + LLM-Aufruf-Einstieg; synchrone API, nicht intrusiv |
| B. Eager recreate                              | Bei Session-Reset sofort `await createContentGenerator(...)` ausführen, async von `resetSession` erforderlich | Mittel: API-Änderungen kaskadieren über mehrere Stellen                                   |
| C. Proxy-Headers-Objekt                        | `httpOptions.headers` mit einem Proxy für den Getter umschließen                         | Hohes Risiko: Ob `@google/genai` intern die Header pro Request neu liest, ist unbekannt; Verhalten könnte silently brechen |
| D. Upstream-PR für `@google/genai` um `fetch`-Option erweitern | PR bei google-deepmind/generative-ai-js einreichen                                       | Langfristig; nicht kontrollierbar                                                        |
**Dokumentation soll vor dem Benutzer erläutern**: Bei Verwendung des Gemini-Providers ist die Session-ID auf dem Wire unmittelbar nach `/clear` noch die alte, wenn sofort ein LLM-Aufruf erfolgt. Kann indirekt über Trace-Korrelation korrigiert werden (session.id in Spans/Logs ist bereits neu).

Es sollte ein eigener Folge-Sub-Issue zur Verfolgung von Option A eröffnet werden.

## 9. Vergleich mit claude-code

| Dimension                     | claude-code                                                                                                                                          | qwen-code, dieses Design                                                                                                                                                     | Entscheidungsgrundlage                                                                                                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Session-ID-Header-Benennung   | `X-Claude-Code-Session-Id` (Produktpräfix)                                                                                                           | `X-Qwen-Code-Session-Id` (Produktpräfix)                                                                                                                                      | ✅ Gleiche Namespace-Strategie                                                                                                     |
| Session-ID-Injektionsmechanismus | SDK `defaultHeaders` (`client.ts:108`) + eigener `buildFetch()`-Wrapper (`client.ts:370-390`, per-Request `randomUUID()`-Injektion in `x-client-request-id`) | OpenAI/Anthropic über Fetch-Wrapper (per-Request wird Session-ID gelesen, vermeidet `/clear`-Staleness); Gemini über statische `httpOptions.headers` (SDK-Limitierung)        | Angleichung an claude-code-Fetch-Wrapper-Muster. Auch claude-code verwendet Fetch-Wrapper, um per-Request `x-client-request-id` hinzuzufügen. |
| Session-ID-Persistenz         | claude-code hat kein `/clear`-artiges Session-Reset; Session = Process                                                                               | Hat `/clear`-Reset → Fetch-Wrapper-Pfad folgt automatisch; statische Header-Pfade werden stale (§8.6)                                                                        | Für qwen-code einzigartige Komplexität                                                                                             |
| Session-ID-Kodierung          | HTTP-Header (kein Baggage)                                                                                                                           | HTTP-Header                                                                                                                                                                   | ✅ Gleich – backend-freundlich                                                                                                     |
| `traceparent`-Injektion       | Closed Source; öffentliche Docs beschreiben Existenz; Open-Source-Repo enthält keine `propagation.inject` / `UndiciInstrumentation`-Referenzen        | `@opentelemetry/instrumentation-undici` automatisch                                                                                                                           | claude-code-Implementierung ist nicht einsehbar. Wir wählen den von OTel empfohlenen, leichteren Weg.                             |
| `traceparent`-Sendebereich    | Nur First-Party-Anthropic-API; nicht an Bedrock/Vertex/Foundry                                                                                       | An alle ausgehenden Fetch-Aufrufe (W3C-Standard; Trace-ID ist `sha256(sessionId)`-Hash). **R3-Überarbeitung**: Session-ID-Header wird nur in die First-Party-Whitelist (Alibaba/DashScope) injiziert, Dritte standardmäßig nicht. Siehe §11. | Nach R3 haben qwen-code-Session-Header die gleiche First-Party-only-Semantik wie claude-code; `traceparent` bleibt als Follow-up pro Ziel-Umschalter offen. |
| `x-client-request-id` (zufällig) | Ja, automatisch                                                                                                                                      | Wird vorerst nicht umgesetzt (eigenständiges Follow-up-Sub-Issue ist wertvoller)                                                                                              | Umfangssteuerung                                                                                                                   |
| Subprozess-`TRACEPARENT`-Env  | Dokumentation räumt Existenz ein (Implementierung closed source)                                                                                     | Wird nicht umgesetzt (eigenständiges Follow-up)                                                                                                                               | Umfangssteuerung                                                                                                                   |
| Eingehendes `TRACEPARENT`-Lesen| Dokumentation räumt Existenz ein (`-p` / Agent SDK-Modus)                                                                                           | Wird nicht umgesetzt (eigenständiges Follow-up)                                                                                                                               | Umfangssteuerung                                                                                                                   |
## **verified vs documented Annotation**:

| Behauptung                                      | Verifizierungsstatus                                                                                                                   |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders` | ✅ Open Source `src/services/api/client.ts:108` gelesen                                                                              |
| `x-client-request-id` via fetch wrapper         | ✅ Open Source `src/services/api/client.ts:370-390` gelesen                                                                          |
| `traceparent` Injektion                         | ⚠️ Nur `docs.claude.com/docs/en/monitoring-usage.md` erwähnt; Open Source Repo `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` liefert leer |

## 10. Zukünftige Arbeiten

Hängt unter #3731 P3, dieses Design **enthält** diese Punkte **nicht**, ist aber verwandt:

- **`X-Qwen-Code-Request-Id`**: zufällige UUID pro Request (Claude-Code-Äquivalent: `x-client-request-id`). Nützlich für Timeout/Fehler-Korrelation – der Server hat bei Timeout vielleicht noch keine Request-ID vergeben, die clientseitig gesendete ID ist das einzige Korrelationsmittel. Nach der R3-Überarbeitung wird dieser Vorschlag sinnvoller: die UUID pro Request birgt kein Risiko der „übergreifenden Verhaltensprofilierung“ und kann als „Support/Debug-Header für alle LLM-Provider“ gesendet werden.
- **`traceparent` per-Destination-Scope-Toggle**: R3 behandelt nur den Scope des Session-ID-Headers; `traceparent` wird weiterhin in alle ausgehenden Fetchs injiziert. Option `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'` könnte hinzugefügt werden, die dasselbe Allowlist wie §11 verwendet, um das Verhalten zu bestimmen.
- **Gemini Session-ID-Staleness-Lazy-Invalidate-Fix** (§8.6 Option A): bei `/clear` den `contentGenerator` als dreckig markieren, beim nächsten LLM-Aufruf lazy neu erstellen. So profitiert auch der Gemini-Pfad von der Echtzeitfähigkeit des Fetch-Wrappers.
- **Umgebungsvariable `TRACEPARENT` für Unterprozesse**: beim Ausführen von `BashTool`-Prozessen die Umgebungsvariable setzen, damit externe Tools die Trace fortsetzen können. Erfordert separate Betrachtung des Tool-Execution-Lifecycle.
- **Eingehende `TRACEPARENT`**: beim Start im `--prompt`-Modus die Umgebungsvariable lesen, damit CI/externe Orchestratoren Qwen-Code in einen größeren Trace einbinden können.
- **Konfigurierbarer `correlationHeader`-Name**: Unternehmen können den Header (Standard `X-Qwen-Code-Session-Id`) anpassen.
- **`baggage`-Propagation-Strategie**: ob aktiv `baggage` gesetzt werden soll, sodass `user.id` / `tenant.id` etc. ebenfalls via Baggage an nachgelagerte Systeme weitergereicht werden. Diese Iteration nicht, warten auf klare Anforderungen.

## 11. R3-Überarbeitung – Host-Allowlist-Scoping für `X-Qwen-Code-Session-Id`

> Auslöser: [REQUEST_CHANGES-Review von LaZzyMan in PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Umsetzungs-Commits: `1c8528a56` (Kernimplementierung) + `cb162e716` (Vertex baseUrl fail-closed + `["*"]` Trim-Toleranz)

### 11.1 Auslöser und Argumentation

Das R1-Design injizierte `X-Qwen-Code-Session-Id` in **alle** ausgehenden LLM-Requests, nur gesteuert durch `telemetry.enabled`. LaZzyMans Review identifizierte drei progressive Probleme:

1. **Fehlplatzierung des Labels**: `feat(telemetry):` + `telemetry/`-Pfad + `getTelemetryEnabled()`-Gate lassen Benutzer berechtigterweise annehmen, dass „eigene Observability-Daten zum eigenen Collector fließen". Aber `X-Qwen-Code-Session-Id` erreicht nicht das OTLP-Backend, sondern reist in LLM-API-Requests zu DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral. Zwei unterschiedliche Datenabfluss-Entscheidungen hängen an einem Schalter.

2. **Claude-Code-Analogie nicht zutreffend**: R1 argumentierte in §9, dass „Namensraumstrategie und Fetch-Wrapper-Muster" an Claude-Code angeglichen seien. Aber Claude-Code ist einseitig (Anthropic ↔ Anthropic, Single-Vendor, Single-Direction), während Qwen-Code ein Open-Source-CLI ist, der an mehrere Drittanbieter-Provider sendet. „Eine stabile, übergreifende Request-UUID an alle Drittanbieter zu senden" ist die von R1 nicht beantwortete Frage.

3. **Traceparent ist ein weiterer Kanal für denselben Fingerabdruck**: Trace-ID = `sha256(sessionId).slice(0,32)`, für den Empfänger immer noch ein stabiler Session-Identifikator (Hash nicht umkehrbar, aber innerhalb derselben Session stabil).

LaZzyMan bewertete den Schweregrad: Session-ID `hoch` / Traceparent `mittel`.

### 11.2 Lösungsübersicht

**Standardmäßigen Umfang auf First-Party-Hosts einschränken**. Neue Einstellung:

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // Stellt R1-Broadcast-Verhalten wieder her
  "sessionIdHeaderHosts": []                              // Header komplett deaktivieren
  "sessionIdHeaderHosts": ["api.mycompany.com",
                           "*.gateway.mycompany.internal"]
}
```

Standardwert (aus `packages/core/src/telemetry/trusted-llm-hosts.ts:DEFAULT_SESSION_ID_HEADER_HOSTS`):

```
dashscope.aliyuncs.com
dashscope-intl.aliyuncs.com
*.dashscope.aliyuncs.com
*.dashscope-intl.aliyuncs.com
*.alibaba-inc.com
*.aliyun-inc.com
```

Die Semantik dieser Sammlung ist: „LLM-Provider, ARMS-Tracing-Backend, Qwen-Code-Distribution – gleiche rechtliche Einheit" – also das Claude-Code-Äquivalent der Single-Vendor/Single-Direction-Beziehung in Qwen-Code. Drittanbieter (OpenAI / Anthropic / OpenRouter / etc.) empfangen den Header standardmäßig **nicht**.

### 11.3 Pattern-Syntax (bewusst klein)

`matchesTrustedHost(hostname, patterns)` unterstützt nur zwei Muster, abgestimmt auf `DashScopeOpenAICompatibleProvider.isDashScopeProvider`:

- einfacher Hostname → exakter Match (case-insensitive)
- `*.suffix` → matcht `suffix` selbst **UND** beliebige Subdomains; dot-verankert, verhindert Angriffsvektoren wie `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld`

Keine Regex, kein Port/Scheme-bewusstes Globbing – der String in den Einstellungen entspricht genau seiner Lesebedeutung.

### 11.4 Implementierungsunterschiede zu R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

R1s Wrapper hatte nur zwei Gates: TelemetryEnabled + SessionId. R3 fügt ein drittes Gate zwischen beiden ein:

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
      return baseFetch(input, init); // Host-Gate
    }
  }
  const sid = config.getSessionId();
  if (!sid) return baseFetch(input, init);
  // ... Header-Injektion
};
```
`trustedHosts` wird beim wrap als einmaliger Snapshot erstellt (anders als die Session-ID, die pro Request live ausgelesen wird). Eine nachträgliche Änderung von `telemetry.sessionIdHeaderHosts` erfordert einen Neuaufbau des contentGenerator, um wirksam zu werden. Schreibweisen wie `[" * "]` mit Leerzeichen werden durch `.trim()` als Broadcast abgesichert, um stille Degradation durch Tippfehler in settings.json zu vermeiden.

#### `staticCorrelationHeaders` (Gemini)

Signatur um einen `destinationUrl?: string` Parameter erweitern:

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: unbekanntes Ziel → kein Header
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Gemini Factory Integration

Das Gemini SDK hat zwei unsichtbare Standard-Endpunkte (`generativelanguage.googleapis.com` und `{region}-aiplatform.googleapis.com`, bestimmt durch `vertexai`), die auf Factory-Ebene nicht eindeutig rekonstruiert werden können. R3 wählt: Wenn `config.baseUrl` nicht gesetzt ist, wird `undefined` übergeben → der Helper schaltet fail-closed → kein Header gesendet. Betreiber, die Korrelation wünschen, müssen `baseUrl` explizit setzen (derselbe Input, den das SDK zur Auflösung des Ziels verwendet). Diese Änderung verhindert, dass ein fälschlich ermittelter Vertex-Endpunkt fälschlicherweise von der Whitelist erfasst wird.

### 11.5 Neue Dateien / Neuer Code

| Datei                                                                                        | Beschreibung                                                                                                                             |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (NEU)                                     | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                                                           |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (NEU)                                | Unit-Tests, inkl. TLD-Suffix-Angriffsvektoren, IPv6 fail-closed, Port/Userinfo/Query-Extraktion                                          |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                       | Host-Gate hinzugefügt; `staticCorrelationHeaders` um `destinationUrl` Parameter erweitert                                                 |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                                  | Host-Gate mit 8 Cases; `mockConfig` verwendet `'hosts' in opts` zur Unterscheidung "default allowlist" vs "broadcast"                     |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`)                          | `sessionIdHeaderHosts` durchgereicht                                                                                                     |
| `packages/core/src/config/config.ts`                                                         | `TelemetrySettings.sessionIdHeaderHosts` + `getTelemetrySessionIdHeaderHosts()` Getter                                                    |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                     | `config.baseUrl` an Helper übergeben; fail-closed bei `undefined`                                                                        |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`                                | Telemetry-on-Gemini-Tests umgeschrieben, um die neue fail-closed-Semantik abzubilden                                                      |
| `packages/cli/src/config/settingsSchema.ts`                                                  | `sessionIdHeaderHosts` JSON-Schema-Eintrag                                                                                               |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                                 | Neu generiert durch `npm run generate:settings-schema`                                                                                   |
| `docs/developers/development/telemetry.md`                                                   | Abschnitt "Session correlation header" umgeschrieben + Standard-Scope + Override-Syntax                                                  |

### 11.6 Antworten auf die einzelnen Argumente von LazzyMan

| LazzyMans Argument                      | R3 Antwort                                                                                                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① Telemetry-Tag falsch platziert        | **Entschärft**: Im DashScope-Anwendungsfall wird der Session-ID-Header buchstäblich an das ARMS-Tracing-Backend (gleiche juristische Einheit) gesendet, sodass die `telemetry.enabled` Semantik passt. |
| ② Cross-Vendor stabiler Identifier als Broadcast | **Entschärft**: Standard-Allowlist enthält nur Alibaba-eigene First-Party-Hosts; Broadcast wird zu Opt-In (`["*"]`)                                                                                    |
| ③ traceparent als weiterer Kanal für denselben Fingerabdruck | **Vorläufig beibehalten**: traceparent wird weiterhin wie in R1 in alle Anfragen injiziert. Begründung: W3C-Standard, Trace-ID ist SHA-256-Hash, In-Vendor-Trace-Fortsetzung ist Kernanwendungsfall von W3C. Per-Destination-traceparent-Toggle in §10 Future Work aufgenommen. |

### 11.7 Bekannte Altlasten + Follow-ups

- **traceparent-Scope** – siehe Punkt ③ oben, in §10 aufgenommen
- **Per-Request-Zufalls-UUID** (`X-Qwen-Code-Request-Id`) – von LazzyMan vorgeschlagene Alternative, in §10 aufgenommen
- **Gemini-Staleness-Lazy-Invalidation** (§8.6 Option A) – von R3 entkoppelt, eigenständiges Sub-Issue
- **`matchesTrustedHost` IPv6-Unterstützung** – Aktuell werden IPv6-Ziele nie in der Allowlist erfasst (`URL.hostname` gibt `[::1]` mit eckigen Klammern zurück, Pattern-Syntax hat kein entsprechendes Format). Deckt derzeit den Anwendungsfall "benannte First-Party-Endpunkte" ab. Falls zukünftig Raw-IP-Allowlist benötigt wird, kann erweitert werden.

## 12. R4-Überarbeitung — Scope Conflation Split

> Auslöser: [LaZzyMan round-8 follow-up review on PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Umsetzung: Dieses PR schränkt ein; der in R3 umgesetzte Session-ID-Satz wird in ein separates Follow-up-PR verschoben.

### 12.1 Auslöser und Begründung

R3 hat LaZzyMans Bedenken aus der ersten Review-Runde hinsichtlich eines "Broadcasts stabiler Fingerabdrücke an Drittanbieter-Provider" (Schweregrad: hoch) ausgeräumt. In der Round-8-Follow-up-Review eskalierte er jedoch zu einem grundlegenderen Architektur-Einwand:

> "Telemetry ist kein Container für benachbarte Funktionen. Die `traceparent`-Cross-Process-Propagation und die `X-Qwen-Code-Session-Id`-Header-Injektion sind **kein Telemetry**. Es handelt sich um Outbound-Identity / Outbound-Correlation-Arbeit, die intern einige OTel-APIs als Implementierungsdetail nutzt."
### 12.1 Kernargumente von LazzyMan

- Der **`telemetry`-Namespace** impliziert, dass der Empfänger der eigene OTLP-Collector des Nutzers ist
- Aber `traceparent` und `X-Qwen-Code-Session-Id` haben als Empfänger **den LLM-Provider eines Drittanbieters**
- Zwei verschiedene Empfängerklassen erfordern zwei verschiedene Entscheidungsbäume zur Einwilligung
- Selbst wenn das Standardverhalten sicher ist (R3 bereits umgesetzt), schafft die Platzierung von Wire-Level-Verhalten unter `telemetry.*` **einen schlechten Präzedenzfall**: Zukünftige Telemetrie-PRs könnten weiterhin Wire-Verhalten an Dritte einschleusen
- „Wenn wir dieses Prinzip akzeptieren, ist die Aufteilung rein mechanisch. Wenn nicht, ist dieser PR der falsche Ort für die Diskussion, denn die technischen Korrekturen sind bereits vorhanden."

### 12.2 Lösungszusammenfassung („Lösung C" – hybride Aufteilung)

Nach mehreren internen Gesprächen (einschließlich einer von yiliang vorgeschlagenen Alternative mit `customHeader`-Vorlage, die jedoch als ungeeignet für laufzeitdynamische Werte eingestuft wurde) fiel die Entscheidung für **Lösung C**:

**In diesem PR verbleibend**:

- Registrierung von `UndiciInstrumentation` (erzeugt Client-HTTP-Spans → eigener OTLP-Collector des Nutzers)
- OTLP-Feedback-Loop-Guard (notwendige Nebenwirkung des Vorgenannten)
- **Standardmäßige Installation von `NoopTextMapPropagator`** → `propagation.inject()` ist ein No-op → Outbound-`fetch`-Aufrufe **enthalten kein `traceparent` mehr**
- **Neue Einstellung `outboundCorrelation.propagateTraceContext: bool` (Standardwert false)** als Top-Level-Einstellung im unabhängigen Namespace; bei `true` wird der Standard-W3C-Composite-Propagator installiert
- **Der gesamte R3-Session-ID-Code** (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / Einstellung `telemetry.sessionIdHeaderHosts` / 4 Provider-Integrationen / alle zugehörigen Tests) **wird vollständig entfernt**

**In einen Folge-PR verschoben**:

- Die gesamte `X-Qwen-Code-Session-Id`-Maschinerie (Wiederverwendung der R3-Implementierung)
- Einzug in den neuen Namespace `outboundCorrelation.*` (konkreter Setting-Key noch offen, **aber nicht** `telemetry.*`)
- Der Folge-PR enthält: Bedrohungsmodell-Abschnitt, eigenständiges Review, als sicherheitsrelevant gekennzeichnete Doku
- `X-Qwen-Code-Request-Id` – ein von LazzyMan in der R3-Runde vorgeschlagenes pro-Request-UUID – wird in diesem Folge-PR ebenfalls berücksichtigt

### 12.3 Mapping zu R1/R3-Argumenten

| R1/R3-Argument                                                      | Status nach R4                                                                                                  |
| ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| §3.1 „Alle ausgehenden LLM-Anfragen erhalten traceparent"          | ❌ **R4 standardmäßig aus**; erst mit `outboundCorrelation.propagateTraceContext: true` aktiviert                |
| §3.1 „Alle ausgehenden LLM-Anfragen erhalten `X-Qwen-Code-Session-Id`" | ❌ **R4 komplett aus diesem PR entfernt**, in Folge-PR verschoben                                              |
| §4.3 Fetch-Wrapper injiziert Session-ID                            | ❌ Code nicht in diesem PR; wird im Folge-PR wiederverwendet                                                   |
| §11 Host-Allowlist (R3-Design)                                     | ❌ Wie oben; komplett in Folge-PR migriert                                                                      |
| §4.4 Keine neue Einstellung einführen                              | ❌ **Dieser PR führt `outboundCorrelation.propagateTraceContext`** als Boolean ein; session-ID-bezogene Settings im Folge-PR |
| §10 Zukunft: „`X-Qwen-Code-Request-Id`"                            | ✅ weiterhin Zukunft; wird zusammen mit session-id-Follow-up entworfen                                          |

### 12.4 Designabsicht des neuen Namespace

Der Top-Level-Namespace `outboundCorrelation.*` enthält in diesem PR nur einen Boolean (`propagateTraceContext`), wirkt also überstrukturiert. Dies ist jedoch **bewusst gewählt**:

- **Namespace als Versprechen**: Zukünftige session-id / request-id / etc. können natürlich in diesen Namespace eingeordnet werden
- **Als sicherheitsrelevant kennzeichnen**: Die `settingsSchema.ts`-Beschreibung enthält explizit den Hinweis „SECURITY-RELEVANT", dokumentiert als „Sicherheitseinstellung" statt „Observability-Einstellung"
- **Standardeinstellungen alle aus**: Entspricht dem von LazzyMan vorgeschlagenen Prinzip, dass Open-Source-Clients keine stabilen IDs ohne explizite Zustimmung an Dritte senden sollten
- **Entkopplung von `telemetry.*`**: Wenn der Nutzer in `settings.json` `outboundCorrelation.*` sieht, erkennt er sofort, dass es sich um ausgehendes Wire-Verhalten handelt, nicht um Observability

#### Implizite Abhängigkeit: `telemetry.enabled`

Obwohl der Namespace von `telemetry.*` entkoppelt ist, **erfordert die Laufzeitwirksamkeit weiterhin `telemetry.enabled: true`** – das OTel-SDK wird nur bei aktivierter Telemetrie initialisiert; ohne SDK gibt es keine Propagator-Installation, keinen `propagation.inject()`-Aufruf, und das Flag bleibt stumm wie ein No-op. Häufige Falle: Ein Betreiber setzt `propagateTraceContext: true`, vergisst aber, die Telemetrie zu aktivieren – der Trap-Server sieht kein einziges `traceparent`, kein Fehler, keine Warnung.

Beide benutzerorientierten Oberflächen dokumentieren diese Abhängigkeit explizit:

- In `telemetry.md` enthält der Abschnitt zu `propagateTraceContext` ein vollständiges JSON-Beispiel mit beiden Flags
- In `settingsSchema.ts` beginnt der Beschreibungstext **im ersten Satz** mit „Requires `telemetry.enabled: true`" (so platziert, dass die Abhängigkeit auch dann sichtbar ist, wenn die VS Code-Einstellungs-UI lange Beschreibungen einklappt)

Für zukünftige Erweiterungen um den Session-ID-Header oder andere `outboundCorrelation.*`-Einstellungen **gilt dieselbe Abhängigkeit** – sie sind nur bei aktivierter Telemetrie sinnvoll (da alle über die OTel-Instrumentierung/das SDK injiziert werden). Der Folge-PR sollte dieses Muster der Footgun-Warnung übernehmen.

### 12.5 Umsetzung

| Datei                                                                                 | Änderung                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                | **Gelöscht**                                                                                                                                                                                        |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                           | **Gelöscht**                                                                                                                                                                                        |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                                    | **Gelöscht**                                                                                                                                                                                        |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                               | **Gelöscht**                                                                                                                                                                                        |
| `packages/core/src/telemetry/sdk.ts`                                                  | + `NoopTextMapPropagator`; `textMapPropagator` des SDK wird je nach `getOutboundCorrelationPropagateTraceContext()` gesetzt                                                                          |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                   | Entfernung des Imports von `wrapFetchWithCorrelation`                                                                                                                                               |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`                 | Dasselbe                                                                                                                                                                                            |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`       | Dasselbe                                                                                                                                                                                            |
| `packages/core/src/core/geminiContentGenerator/index.ts`                              | Entfernung des Imports von `staticCorrelationHeaders`                                                                                                                                               |
| `*.test.ts` der vier Provider                                                         | Entfernung der session-id-bezogenen Testfälle                                                                                                                                                       |
| `packages/core/src/config/config.ts`                                                  | Löschung von `TelemetrySettings.sessionIdHeaderHosts` und `getTelemetrySessionIdHeaderHosts`; **Neuerstellung des Interfaces `OutboundCorrelationSettings` + Feld `outboundCorrelationSettings` + Getter `getOutboundCorrelationPropagateTraceContext()`** |
| `packages/core/src/telemetry/config.ts`                                               | Entfernung der Durchleitung von `sessionIdHeaderHosts` in `resolveTelemetrySettings`                                                                                                                |
| `packages/cli/src/config/settingsSchema.ts`                                           | Löschung des `sessionIdHeaderHosts`-Schemas; **Neuerstellung des Top-Level-Schema-Eintrags `outboundCorrelation`**                                                                                  |
| `packages/cli/src/config/config.ts`                                                   | Durchleitung von `outboundCorrelation: settings.outboundCorrelation` in `ConfigParameters`                                                                                                          |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                          | Erneute Generierung mit `npm run generate:settings-schema` (bei späteren Beschreibungsupdates synchron aktualisieren)                                                                               |
| `docs/developers/development/telemetry.md`                                            | Umschreiben von „Trace context propagation" → „Client-side HTTP span on outbound fetch"; Löschung des gesamten Abschnitts „Session correlation header"; Neuerstellung von Top-Level-Abschnitt „Outbound correlation (SECURITY-RELEVANT)" mit Abhängigkeitshinweis auf `telemetry.enabled` + JSON-Konfigurationsbeispiel |
| `docs/design/telemetry-outbound-propagation-design.md`                                | Dieser Abschnitt + R4-Tabellenkopf + Änderungszeiger                                                                                                                                                |
| `packages/core/src/config/config.test.ts`                                             | **Neuer `describe`-Block `OutboundCorrelation Configuration`**, mit `it.each` 4 Testfällen zur Sicherstellung der Default-false-Sicherheitsinvariante von `getOutboundCorrelationPropagateTraceContext` (weggelassen / `{}` / explizit true / explizit false) |
### 12.6 Antwort auf LazzyMans Metargumente

| Argument | Status nach R4 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| "Telemetry-Namespace deutet auf eigenen Collector-Empfänger hin" | ✅ Wire-Verhalten aus `telemetry.*` entfernt; neuer `outboundCorrelation.*`-Namespace kennzeichnet explizit die Semantik "ausgehend zu Dritten" |
| "Standardverhalten sollte ohne explizite Zustimmung keine Identifikatoren an Dritte senden" | ✅ `propagateTraceContext` standardmäßig false; die gesamte session-id-Follow-up-PR wird ebenfalls standardmäßig deaktiviert sein |
| "Telemetry-PR sollte kein Wire-Level-Verhalten einschmuggeln" | ✅ Dieser PR fügt keine Codepfade mehr hinzu, wo Telemetry das Wire-Verhalten steuert; Wire-Verhalten wird einheitlich von `outboundCorrelation.*` verwaltet |
| "Split is mechanical, work isn't wasted" | ✅ R3-Code physisch aus diesem Branch entfernt, verbleibt in der Git-Historie zur Wiederverwendung durch Follow-up-PRs (oder Cherry-Pick) |

### 12.7 Follow-up-PR-Übersicht (informativ, nicht Teil dieses PRs)

Zukünftige Follow-up-PRs sollten Folgendes enthalten:

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` oder eine ähnliche Einstellung
- Wiederverwendung des bereits in R3 implementierten Code-Gerüsts `wrapFetchWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`
- Ein Threat-Model-Abschnitt, der Folgendes klarstellt: Empfänger-Menge, De-Anonymisierungsfenster stabiler IDs, optionale per-Request-UUID-Begleitung
- **Standardmäßig deaktiviert** (keine Standard-Allowlist – strenger als R3, entspricht LazzyMans Open-Source-CLI-Prinzip)
- Sicherheitsrelevante Kennzeichnung + Aufnahme in `docs/users/configuration/settings.md`
