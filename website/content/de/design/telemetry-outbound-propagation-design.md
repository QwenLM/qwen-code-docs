# Telemetrie: Outbound Trace Context & Session ID Header Propagation

> Passendes Issue: [#4384](https://github.com/QwenLM/qwen-code/issues/4384)
> Übergeordnetes Issue: [#3731](https://github.com/QwenLM/qwen-code/issues/3731) (P3 tiefere Observability)
> Vorhergehender PR: #4367 (Ressourcenattribute — gemerged am 21.05.2026, Commit `64401e1`)
> Basierend auf dem qwen-code main-Branch (Stand 21.05.2026) + direkt verifiziertem claude-code Quellcode

## Änderungshistorie

| Revision | Datum       | Auslöser                                   | Zusammenfassung                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------- | ----------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1       | 21.05.2026 | Erster Entwurf                             | Volle Broadcast: Alle ausgehenden LLM-Anfragen erhalten `X-Qwen-Code-Session-Id` + `traceparent`                                                                                                                                                                                                                                                                                                                                        |
| R2       | 22.05.2026 | wenshao R2/R3 Review                       | Grenzsicherheit: URL-Normalisierung, Port-Matching, Quote-Angleichung, `staticCorrelationHeaders` try/catch, `host:port` Fallback Strip                                                                                                                                                                                                                                                                                                |
| R3       | 23.05.2026 | LaZzyMan REQUEST_CHANGES                   | **Wesentliche semantische Änderung**: Der Standard-Gültigkeitsbereich von `X-Qwen-Code-Session-Id` wird auf die Whitelist der First-Party (Alibaba/DashScope) Hosts eingeschränkt. Siehe §11.                                                                                                                                                                                                                                           |
| R4       | 25.05.2026 | LaZzyMan round-8 Follow-up (Scope-Vermischung) | **PR-Umfang stark reduziert**: Dieser PR behält nur noch den Client-HTTP-Span + OTLP-Loop-Guard; `traceparent` ist standardmäßig ausgeschaltet (NoopTextMapPropagator); neuer Top-Level-Namespace `outboundCorrelation.*` für sicherheitsrelevante Toggles; die gesamte in R3 implementierte `X-Qwen-Code-Session-Id`-Maschinerie wird **aus diesem PR entfernt** und in einen eigenständigen Follow-up-PR verschoben. Siehe §12. |

**Wichtiger Hinweis**: Lesen Sie §3.1 (Ziele) / §3.2 (Nicht-Ziele) / §4.3 (Part B Design) / §4.4 (Auswirkungen auf das Konfigurationsschema) / §5 (Dateiänderungsliste) / §9 (Vergleich mit claude-code) / §10 (Zukünftige Arbeiten) / §11 (R3 Host-Allowlist-Eingrenzung) bitte immer in Verbindung mit §12 — **Revision R4 macht die Aussagen von R1-R3, dass "dieser PR gleichzeitig traceparent + session id header umsetzt", ungültig**: Dieser PR stellt nun lediglich Telemetrie-Observability + einen unabhängigen Outbound-Trace-Context-Toggle bereit; sämtliche Outbound-Correlation-Header-Arbeiten (einschließlich der R3 Host-Allowlist) werden vollständig in einen separaten Follow-up-PR verschoben. Der Code aus R3 ist nicht verschwendet und kann im Follow-up-PR wiederverwendet werden.

## 1. Hintergrund

#4367 hat die **Attribute und Kardinalität auf emittierten Telemetriedaten** gelöst (Operatoren können Spans/Logs/Metriken mit `user.id`/`tenant.id` etc. versehen). Es hat jedoch eine Sache nicht behandelt: **HTTP-Header ausgehender LLM-Anfragen**. Die heutigen Anfragen von qwen-code an DashScope / OpenAI / Gemini / Anthropic **enthalten keinerlei Cross-Process-Correlation-Header** — weder W3C `traceparent` noch eine Session-ID.

Konsequenzen:

1. Der Trace-Context wird an der Prozessgrenze von qwen-code unterbrochen. Falls der Modellservice (z. B. DashScope mit ARMS Tracing) selbst über eine OTel-Instrumentierung verfügt, sind die von ihm erzeugten Spans von denen in qwen-code unabhängig; ein End-to-End-Trace-Baum existiert nicht.
2. Es gibt keine Session-ID auf der Leitung. Um Metriken/Logs von qwen-code mit serverseitigen Logs zu verknüpfen, muss das Backend offline Trace-IDs oder Zeitstempel abgleichen, was weitaus weniger einfach ist, als den Header direkt zu lesen.
3. Lokalen Traces fehlt eine Client-seitige HTTP-Span-Ebene. Derzeit ist nur die Gesamtdauer von `api.generateContent` sichtbar, nicht jedoch die Netzwerk-TTFB / Antwortgröße / Anzahl der Wiederholungen.

## 2. Aktueller Stand

### 2.1 Nur `HttpInstrumentation` aktiviert

`packages/core/src/telemetry/sdk.ts:330`:

```ts
instrumentations: [new HttpInstrumentation()],
```

`HttpInstrumentation` hookt nur die in Node.js integrierten `http`/`https`-Module, **nicht** den `globalThis.fetch` / undici-Pfad.

### 2.2 Beide LLM-SDKs nutzen fetch / undici

| SDK                                              | HTTP-Implementierung                                                                                                                | Von `HttpInstrumentation` abgedeckt? |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `openai@5.11.0`                                  | `globalThis.fetch` (Node 18+ also undici). Beleg: `node_modules/openai/internal/shims.mjs` Fehler `'fetch' is not defined as a global` | ❌                                   |
| `@google/genai@1.30.0`                           | `globalThis.fetch` + `new Headers()`. Beleg: `new Headers()`-Aufruf in `dist/node/index.mjs`                                        | ❌                                   |
| `@anthropic-ai/sdk` (anthropicContentGenerator)  | Ebenfalls fetch-basiert                                                                                                             | ❌                                   |

### 2.3 Repository ohne manuelle Propagation

```
grep -rn "propagation\.\|setGlobalPropagator\|W3CTraceContext\|traceparent" packages/core/src --include="*.ts" | grep -v "\.test\."
```

→ Leer. Es gibt keinen `propagation.inject()`-Aufruf und keine manuelle traceparent-Injektion.

### 2.4 Aktueller Stand der `defaultHeaders` pro Provider

OpenAI-Familie (verwendet `openai` SDK):

Alle OpenAI-Subprovider `extend DefaultOpenAICompatibleProvider`. **Das `buildHeaders`-Override-Verhalten gliedert sich in zwei Kategorien** (durch grep-Audit verifiziert):

| Provider   | Datei                  | `buildHeaders()`-Verhalten                                                              | Auswirkung                                      |
| ---------- | ----------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------- |
| Basisklasse | `default.ts:63-74`     | Stellt `{ 'User-Agent' }` + customHeaders bereit                                       | Hier ändern                                     |
| DashScope  | `dashscope.ts:110-124` | **`override` ohne `super`-Aufruf** — gibt neues Objekt mit `User-Agent` + `X-DashScope-*` zurück | **Muss separat geändert werden**, sonst Correlation-Header verloren |
| OpenRouter | `openrouter.ts:20-30`  | `override` aber **zuerst `const baseHeaders = super.buildHeaders()`**                         | Änderung an Basisklasse vererbt sich automatisch ✅ |
| DeepSeek   | `deepseek.ts`          | Kein `buildHeaders`-Override (nur `buildRequest` / `getDefaultGenerationConfig`)        | Änderung an Basisklasse vererbt sich automatisch ✅ |
| Minimax    | `minimax.ts`           | Wie DeepSeek                                                                             | Automatisch vererbt ✅                           |
| Mistral    | `mistral.ts`           | Wie DeepSeek                                                                             | Automatisch vererbt ✅                           |
| ModelScope | `modelscope.ts`        | Wie DeepSeek                                                                             | Automatisch vererbt ✅                           |

→ **OpenAI-Familie erfordert Änderungen in 2 Dateien**: `default.ts` und `dashscope.ts`. Die anderen 5 erben automatisch.

Google Gemini:

| Provider | Datei                           | Header-Injektionspfad                                            |
| -------- | ------------------------------- | ---------------------------------------------------------------- |
| Gemini   | `geminiContentGenerator.ts:59` | `new GoogleGenAI({ httpOptions: { headers } })` — natives SDK-Feature |

Anthropic:

| Provider  | Datei                                                                                              | Header-Injektionspfad       |
| --------- | -------------------------------------------------------------------------------------------------- | --------------------------- |
| Anthropic | `anthropicContentGenerator.ts:177` (`buildHeaders`) + `:212` (`defaultHeaders`-Argument für `new Anthropic`) | `defaultHeaders`            |

**Insgesamt 4 SDK-Konstruktionspunkte**, in die ein Session-ID-Header injiziert werden muss. Alle SDKs unterstützen bereits `defaultHeaders` / `httpOptions.headers`, ein fetch-Wrapper ist nicht erforderlich.

### 2.5 Bestehende Proxy- und fetch-Konfiguration

`provider/default.ts:87-89`:

```ts
const runtimeOptions = buildRuntimeFetchOptions(
  'openai',
  this.cliConfig.getProxy(),
);
```

`buildRuntimeFetchOptions` gibt bei konfiguriertem Proxy `{ fetch: customFetch }` oder ähnlich zurück und löst `setGlobalDispatcher(new ProxyAgent(...))` aus (siehe `config.ts:1126-1128`). **Der globale undici-Dispatcher-Modus ist kompatibel mit `UndiciInstrumentation`** — es arbeitet durch Monkey-Patching von `globalThis.fetch` mit den undici-Channel-Diagnostics zusammen und ist nicht vom konkreten Dispatcher abhängig.

## 3. Ziele / Nicht-Ziele

### 3.1 Ziele

- Alle ausgehenden LLM-Anfragen erhalten automatisch den W3C `traceparent`-Header (OTel SDK Standard `W3CTraceContextPropagator`)
- ~~Alle~~ Ausgehende LLM-Anfragen erhalten den `X-Qwen-Code-Session-Id`-Header (gleichnamiger Produktnamespace wie claude-code) — **R3 Revision**: Standardmäßige Injektion nur an First-Party (Alibaba/DashScope) Hosts, standardmäßig nicht an Drittanbieter-Provider; siehe §11
- Automatische Vermeidung von Traces auf den OTLP-Exporter-Endpoint selbst (Feedback-Schleife)
- Hinzufügen einer präzisen Client-Span für LLM-Anfragen (Netzwerkzeit vs. Modellzeit getrennt)
- Abdeckung der 4 Provider-Konstruktionspunkte: OpenAI-Basisklasse, DashScope-Override, Gemini, Anthropic
- Keine Regression bei Streaming-Anfragen / Proxy-Modus / Wiederholungsszenarien
- Konsistente Designphilosophie mit #4367: Nutzung von SDK-nativen Optionen wie `defaultHeaders` — **R1 Revision**: Aufgrund von Staleness-Problemen Wechsel zu fetch-Wrapper; **R3 Revision**: Innerhalb des fetch-Wrappers zusätzlich Host-Gate

### 3.2 Nicht-Ziele

- **`baggage`-Header**: Wird vom Standard-SDK unterstützt, aber qwen-code ruft `propagation.setBaggage()` nicht auf, daher standardmäßig nicht gesendet. Dieses Design aktiviert es nicht explizit.
- **Subprozess `TRACEPARENT`-Umgebungsvariablen-Vererbung**: claude-code injiziert `TRACEPARENT` in Bash/PowerShell-Subprozesse. qwen-code's `BashTool` tut dies nicht. Ist ein eigenständiges Follow-up-Subissue.
- **Einlesen von eingehendem `TRACEPARENT` / `TRACESTATE`**: claude-code's `-p`-Modus und das Agent SDK lesen traceparent aus der Umgebungsvariable, um den Trace des übergeordneten Prozesses fortzusetzen. qwen-code tut dies nicht. Eigenständiges Follow-up.
- **`X-Qwen-Code-Request-Id`**: claude-code hat `x-client-request-id`, nützlich für Timeout-Toleranz-Correlation. Wird in diesem Issue nicht behandelt, könnte ein nächstes Subissue sein.
- **Benutzerdefinierter Propagator (B3 / Jaeger / X-Ray)**: Standard-W3C deckt bereits 99% der Szenarien ab. Könnte als zukünftige Konfigurationsoption hinzugefügt werden.
- ~~**Selektive Injektion pro Endpunkt**: claude-code sendet traceparent nicht an Drittanbieter-Endpoints (Bedrock / Vertex); qwen-code benötigt keine Unterscheidung nach Drittanbietern, kann es einheitlich senden.~~ — **R3 Revision**: Diese Aussage wurde widerlegt. LaZzyMan-Review hat darauf hingewiesen, dass qwen-code ein Open-Source-CLI ist, das mehrere Drittanbieter-Provider (OpenAI / Anthropic / OpenRouter / usw.) verbindet; der First-Party→First-Party-Vergleich von claude-code ist nicht anwendbar; der Session-ID-Header muss nach Host unterschieden werden. Siehe §11. `traceparent` wird weiterhin gemäß R1-Design vollständig injiziert (OTel-Standard-Header, und die Trace-ID ist ein `sha256(sessionId)`-Hash), kann als separates Follow-up mit einem Per-Destination-Toggle (`telemetry.propagateTraceContext`) versehen werden.

## 4. Design

### 4.1 Allgemeine Schichtung

```
┌─ qwen-code Prozess ─────────────────────────────────────────────┐
│                                                                 │
│  ┌─ session-tracing.ts ─┐                                      │
│  │ Aktiver Span-Kontext │                                       │
│  └──────┬───────────────┘                                       │
│         │                                                        │
│         ▼                                                        │
│  ┌─ propagation.inject() (aufgerufen von undici-Instrumentierung) ─┐│
│  │ Schreibt `traceparent: 00-<traceId>-<spanId>-01` in Header    ││
│  └───────────────────────────────────────────────────────────────┘│
│         │                                                        │
│  ┌──────▼────────────────────────────────────────────────────┐  │
│  │   fetch() — undici, instrumentiert                        │  │
│  │   Erzeugt HTTP-Client-Span                                │  │
│  │   Injiziert traceparent in Anfrage-Header                 │  │
│  │   (Über ignoreRequestHook übersprungen, wenn Endpoint OTLP)│  │
│  └──────────────────────────────────────────────────────────┘  │
│         │                                                        │
│         │   ┌─ defaultHeaders (pro SDK-Konstruktor) ─────────┐  │
│         │   │ { 'X-Qwen-Code-Session-Id': sessionId, ... }   │  │
│         └───┴────────────────────────────────────────────────┘ │
│             │                                                    │
└─────────────┼────────────────────────────────────────────────────┘
              │
              ▼ Ausgehendes HTTP
   POST /v1/chat/completions
   traceparent: 00-...
   X-Qwen-Code-Session-Id: ...
   ... (bestehende User-Agent, X-DashScope-*, etc.)
```

Zwei Injektionspfade, unabhängig und voneinander unabhängig:

| Ebene                   | Wann injiziert                     | Wer injiziert                                                     |
| ----------------------- | ---------------------------------- | ----------------------------------------------------------------- |
| `traceparent`           | Bei jedem fetch-Aufruf            | `UndiciInstrumentation` automatisch (vom OTel SDK Standard-Propagator) |
| `X-Qwen-Code-Session-Id`| Einmalig bei SDK-Konstruktion in `defaultHeaders` | Anwendungscode                                             |

### 4.2 Teil A — `traceparent` via undici-Instrumentierung

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

Das OTel-SDK selbst verwendet fetch, um Daten per POST an den OTLP-Collector zu senden. Ohne Auslassung würde `UndiciInstrumentation` auch für "Meldedaten"-Anfragen einen Span erstellen → dieser neue Span würde erneut gemeldet → Endlosschleife / massives Rauschen. Jedes OTel-Projekt ist in diese Falle getappt; die OTel-Dokumentation empfiehlt diesen Hook ausdrücklich.

#### Standard-Propagator

Wenn `NodeSDK` kein `textMapPropagator` übergeben wird, ist der Standardwert `CompositePropagator([W3CTraceContextPropagator, W3CBaggagePropagator])`. Keine explizite Einstellung erforderlich.

#### `traceparent`-Format

```
traceparent: 00-<32hex traceId>-<16hex spanId>-<01 sampled | 00 not sampled>
              ─┬─                                          ─┬─
               Version (fest 00)                            Flags
```

Fest 55 Bytes, kein Padding.

#### `tracestate` und `baggage`

- `tracestate`: Wird nur dann weitergereicht, wenn es vom Vorgänger kam; eigene Injektion fügt nichts hinzu (OTel SDK Verhalten).
- `baggage`: Nur vorhanden, wenn `propagation.setBaggage(ctx, ...)` aufgerufen wurde. qwen-code ruft es nicht auf, daher wird es nicht gesendet.

### 4.3 Teil B — `X-Qwen-Code-Session-Id` via fetch-Wrapper (OpenAI / Anthropic) + statische Header (Gemini)

> **R3 Revision**: Die folgende Designbeschreibung bezieht sich auf die Lösung des Staleness-Problems im fetch-Wrapper und die 4 Provider-Integrationspunkte — diese bleiben erhalten. Der Wrapper erhält jedoch zusätzlich ein Host-Allowlist-Gate, und `staticCorrelationHeaders` erhält einen `destinationUrl`-Parameter. Der aktuelle Implementierungscode mit Host-Gate und Standard-Allowlist siehe §11.

#### Kritisch: Staleness-Problem und Lösungsauswahl

Der naive Ansatz (direktes Einbrennen von `getSessionId()` in `defaultHeaders`) hat einen **echten Bug**:

1. `pipeline.ts:60` ruft bei der Konstruktion des ContentGenerators einmalig `this.client = this.config.provider.buildClient()` auf. Die `defaultHeaders` des SDK-Clients erfassen zu diesem Zeitpunkt die aktuelle Session-ID
2. `config.ts:1850` Session-Reset (ausgelöst durch `/clear` des Benutzers) aktualisiert `this.sessionId` und ruft `refreshSessionContext()` auf, **erzeugt aber keinen neuen ContentGenerator**
3. Nachfolgende LLM-Aufrufe verwenden weiterhin den alten Client → der Wire-Header enthält immer noch die alte Session-ID → Backend-Correlation ist fehlerhaft

→ Die Session-ID muss **pro Anfrage** gelesen werden, nicht bei der Konstruktion eingebrannt.

```
                   ┌─ fetch-Unterstützung ┐  Lösung
OpenAI SDK          │     ✅               │  fetch-Wrapper (pro Anfrage Session-ID lesen) ✅
Anthropic SDK       │     ✅               │  fetch-Wrapper ✅
@google/genai SDK   │     ❌               │  Statisches httpOptions.headers + Staleness akzeptieren
                   └──────────────────────┘
```

`@google/genai`'s `HttpOptions`-Interface unterstützt kein `fetch` (bereits durch grep von `node_modules/@google/genai/dist/genai.d.ts` verifiziert: nur `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`). Daher verwendet Gemini statische Header, inkonsistent zu OpenAI/Anthropic — dies ist ein **bekanntes Limit**, siehe §8.6.

#### Zentrale Hilfsfunktion (Pro-Anfrage fetch-Wrapper)

Neue Datei `packages/core/src/telemetry/llm-correlation-fetch.ts`:

```ts
import type { Config } from '../config/config.js';

/**
 * Umhüllt eine fetch-Implementierung, sodass jede ausgehende Anfrage
 * Correlation-Header (`X-Qwen-Code-Session-Id`) erhält, die aus der
 * **aktuellen** Session-ID stammen, nicht aus dem Wert, der bei der
 * Konstruktion des SDK-Clients erfasst wurde.
 *
 * Entspricht dem Muster von claude-code (src/services/api/client.ts:370-390 —
 * `buildFetch()`). Die Pro-Anfrage-Injektion ist notwendig, da `/clear`
 * die Session-ID während des Prozesses zurücksetzt; SDK-Clients (und ihre
 * statischen `defaultHeaders`) werden bei einem Reset NICHT neu erstellt.
 *
 * Der Aufrufer ist für die Wahl des Basis-fetch verantwortlich — normalerweise
 * `runtimeOptions?.fetch ?? globalThis.fetch`, sodass der proxy-bewusste fetch
 * erhalten bleibt, wenn ProxyAgent verwendet wird.
 *
 * Wenn Telemetrie deaktiviert ist, wird baseFetch unverändert zurückgegeben
 * (kein Correlation-Header hinzugefügt, entsprechend der Datenschutzhaltung von §3.1).
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
      // Defensiv: Leere Header-Werte werden von mancher HTTP-Middleware abgelehnt.
      // Injektion überspringen, anstatt `X-Qwen-Code-Session-Id: ` zu senden.
      return baseFetch(input, init);
    }
    const headers = new Headers(init?.headers);
    headers.set('X-Qwen-Code-Session-Id', sid);
    return baseFetch(input, { ...init, headers });
  };
}
```

Begleit-Helfer für SDKs, die nur statische Header akzeptieren (Gemini):

```ts
/**
 * Statische Correlation-Header. Erfasst die Session-ID zum Zeitpunkt des Aufrufs —
 * **unterliegt Staleness**, wenn das Host-SDK diese Header in einem bei der
 * Konstruktion erfassten Slot behält (z. B. `@google/genai`'s `httpOptions.headers`).
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

Änderung in `buildClient()` — Komposition des vorhandenen `runtimeOptions.fetch` (Proxy) mit unserem Wrapper:

```ts
buildClient(): OpenAI {
  // ... bestehend ...
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
    // Nach dem Spread überschreibt `fetch` den Proxy-bewussten fetch (oder
    // globalThis.fetch, wenn kein Proxy) mit unserem Correlation-Wrapper.
    fetch: wrapFetchWithCorrelation(baseFetch, this.cliConfig),
  });
}
```

`buildHeaders()` selbst bleibt unverändert.

#### Integrationspunkt 2: `provider/dashscope.ts` (Override)

`buildClient()` verwendet das gleiche Kompositionsmuster (es überschreibt ohnehin bereits `buildClient`). `buildHeaders()` bleibt unverändert.

#### Integrationspunkt 3: `geminiContentGenerator/index.ts` (Factory, NICHT Konstruktor)

**Korrektur der übermäßigen Deklaration des vorherigen Designs**: Der Konstruktor von `geminiContentGenerator.ts` **muss** seine Signatur **nicht** ändern. Die Factory-Funktion in `index.ts:48` erhält bereits `gcConfig: Config` (Zeile 33 verwendet bereits `gcConfig?.getUsageStatisticsEnabled()`). Es müssen lediglich in der Factory die statischen Correlation-Header in `httpOptions.headers` eingefügt werden:

```ts
// geminiContentGenerator/index.ts
let headers: Record<string, string> = { ...baseHeaders };
if (gcConfig?.getUsageStatisticsEnabled()) {
  // ... bestehende x-gemini-api-privileged-user-id ...
}
headers = { ...headers, ...staticCorrelationHeaders(gcConfig) }; // ← Neu
const httpOptions = config.baseUrl
  ? { headers, baseUrl: config.baseUrl }
  : { headers };
// new GeminiContentGenerator(...) unverändert
```

Null Signaturänderung.

#### Integrationspunkt 4: `anthropicContentGenerator.ts`

Das Anthropic-SDK akzeptiert ebenfalls einen benutzerdefinierten `fetch` (verwendet bereits `buildRuntimeFetchOptions`). Wrapen Sie den fetch im `buildClient`-Pfad auf die gleiche Weise wie im OpenAI `default.ts`. `buildHeaders` bleibt unverändert.

#### Prioritätskette

Unverändert: Benutzerdefinierte `customHeaders` gewinnen weiterhin im `defaultHeaders`-Merge (siehe §8.2 Spoofing-Diskussion). Der vom fetch-Wrapper injizierte `X-Qwen-Code-Session-Id` wird **nach** der Header-Liste des SDKs dem endgültigen `Headers`-Objekt hinzugefügt — gemäß der Semantik von `Headers.set()` in Node.js überschreibt dies alle zuvor vorhandenen gleichnamigen Header (einschließlich solcher, die der Benutzer in seinen customHeaders angegeben hat).

**Für OpenAI/Anthropic (fetch-Wrapper-Pfad)**: correlation > customHeaders > SDK-Vorgaben.
**Für Gemini (statischer Header-Pfad)**: customHeaders > correlation > SDK-Vorgaben (bestehende Spread-Reihenfolge bleibt erhalten).

Der Unterschied besteht darin, dass im fetch-Wrapper-Pfad Spoofing nicht mehr möglich ist (der fetch-Wrapper läuft nach den SDK-Headern). Dies ist ein **Nebeneffekt der Fehlerbehebung**, keine beabsichtigte Verschärfung — aber sicherer. Dies muss in §8.2 explizit erwähnt werden.

### 4.4 Auswirkungen auf das Konfigurationsschema

~~**Nahezu null**. Dieses Design führt keine neue Einstellung ein~~ — **R3 Revision**: Eine neue Einstellung `telemetry.sessionIdHeaderHosts: string[]` wird eingeführt, um die standardmäßige First-Party-Host-Whitelist zu überschreiben. Das Schemaelement wurde zu `packages/cli/src/config/settingsSchema.ts` hinzugefügt. Beschreibung und Override-Syntax (`["*"]` für Broadcast wiederherstellen / `[]` für vollständige Deaktivierung / benutzerdefiniertes Array) siehe §11. Der folgende Text bezieht sich nur auf vor R3:
- `traceparent` 注入通过 telemetry aktiviert ausgelöst (bereits vorhandener Toggle)
- `X-Qwen-Code-Session-Id`-Einjektion ebenfalls durch telemetry enabled ausgelöst
- Die OTLP-URL von `ignoreRequestHook` wird bereits aus der vorhandenen Konfiguration gelesen

Zukünftig mögliche Einstellungen (**außerhalb des Geltungsbereichs**):

- `telemetry.outboundCorrelationHeader`: Benutzerdefinierter Header-Name (Standard: `X-Qwen-Code-Session-Id`)
- `telemetry.outboundPropagationDisabled`: Globales Deaktivieren (falls der LLM-Dienst unbekannte Header strikt ablehnt)
- ~~Per-Destination-Header-Scope-Toggle~~ — **in R3 umgesetzt**, siehe §11

## 5. Dateiänderungsliste

| Datei                                                                                         | Änderungstyp | Beschreibung                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/package.json`                                                                  | Abhängigkeit | `@opentelemetry/instrumentation-undici`                                                                                                                                                             |
| `packages/core/src/telemetry/sdk.ts`                                                          | Geändert     | +`UndiciInstrumentation` + `ignoreRequestHook`                                                                                                                                                      |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                                        | Neue Datei   | `wrapFetchWithCorrelation()` (OpenAI/Anthropic) + `staticCorrelationHeaders()` (Gemini-Fallback)                                                                                                    |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                           | Geändert     | `buildClient()` fügt in `new OpenAI({...})` `fetch: wrapFetchWithCorrelation(baseFetch, cliConfig)` hinzu                                                                                           |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`                         | Geändert     | Gleiches (überschreibt `buildClient`)                                                                                                                                                               |
| `packages/core/src/core/geminiContentGenerator/index.ts`                                      | Geändert     | In der Factory-Funktion wird `staticCorrelationHeaders(gcConfig)` in `httpOptions.headers` gemergt (**Caller hat bereits Config, null Signaturänderung** — Korrektur der vorherigen Überspezifikation) |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`               | Geändert     | `buildClient`-Pfad verwendet `wrapFetchWithCorrelation`, um die `fetch`-Option des SDKs zu wrappen                                                                                                   |

**Explizit auditiert, aber keine Änderung erforderlich** (um Reviewer-Zweifel an übersehenen Pfaden zu vermeiden):

- `packages/core/src/qwen/qwenContentGenerator.ts` — `extends OpenAIContentGenerator`, verwendet `DashScopeOpenAICompatibleProvider`, **erbt automatisch die buildClient-Änderung von dashscope.ts**. Alle Qwen-OAuth-Flows profitieren ebenfalls.
- `packages/core/src/core/loggingContentGenerator/loggingContentGenerator.ts` — Wrapper-Modus, erstellt keinen SDK-Client (er wrappt andere ContentGenerators für Telemetry-Logging), keine Änderung erforderlich.
- `packages/core/src/core/contentGenerator.ts` — Factory-Einstiegspunkt, hält keinen Client.
  | `packages/core/src/telemetry/sdk.test.ts` | Geändert | Undici-Instrumentierung-Registrierung + ignoreRequestHook-Tests hinzugefügt |
  | `packages/core/src/telemetry/llm-correlation-fetch.test.ts` | Neue Datei | Unit-Tests für Telemetry-on/off-Verhalten + Per-Request-SessionId-Read-Read (kritisch: Nach Session-Reset liest wrapped fetch neue ID) |
  | `*.test.ts` der einzelnen Provider | Geändert | Assertion, dass die `fetch`-Option beim SDK-Aufbau die gewrappte Version ist (OpenAI/Anthropic); Assertion, dass Gemini-Konstruktion `httpOptions.headers` den `X-Qwen-Code-Session-Id` enthält |
  | `docs/developers/development/telemetry.md` | Geändert | Neuer Abschnitt "Trace Context & Session Correlation Propagation" |
  | `docs/design/telemetry-outbound-propagation-design.md` | Diese Datei | Design-Dokument |

## 6. Aufteilung in PRs

Zur Review-Freundlichkeit in zwei PRs aufgeteilt (kann auch zusammengelegt werden, Größe erlaubt):

### PR 1 — Automatische `traceparent`-Injektion (strukturell)

- Abhängigkeit `@opentelemetry/instrumentation-undici` hinzufügen
- In `sdk.ts`: `UndiciInstrumentation` + `ignoreRequestHook` hinzufügen
- Tests: SDK-Registrierung, OTLP-Endpoint wird nicht getraced
- Dokumentation-Ausschnitt

**Risiko**: Niedrig. Additiv. Vorhandene Client-Spans sind ein Netto-Gewinn, ändern keine bestehende Span-Struktur.

### PR 2 — `X-Qwen-Code-Session-Id`-Header (mit Hilfsfunktionen)

- Neue Datei `llm-correlation-headers.ts`
- Integration in 4 Provider
- Tests: Für jeden Provider Header vorhanden; bei telemetry-off nicht gesendet
- Dokumentation-Ausschnitt

**Risiko**: Niedrig-Mittel. Vorsicht bei der Erweiterung der `geminiContentGenerator`-Konstruktorsignatur, die Aufrufer beeinflussen könnte.

### PR 3 (optional) — Docs + E2E-Verifikation

- Abschnitt in `telemetry.md` vervollständigen
- E2E-Verifikationsskript hinzufügen (analog `/tmp/verify-telemetry-pr-4367.mjs`-Muster): Echten Fetch ausführen und Header erfassen

Kann auch in PR 2 zusammengefasst werden.

### Reihenfolgepräferenz

PR 1 und PR 2 sind technisch **voneinander unabhängig** — teilen keinen Code. **Empfehlung: PR 1 zuerst einspielen**:

- `traceparent` ist ein OTel-**Standard**-Header, jedes OTel-fähige Collector/Backend erkennt ihn sofort → sofortiger Nutzen
- `X-Qwen-Code-Session-Id` ist ein **produktspezifischer** Header, erfordert Backend-Konfiguration zur Erkennung → Nutzen zeitlich versetzt
- Falls PR 2 lange reviewt wird, läuft Cross-Process-Trace bereits via PR 1
- PR 1 ist additive-strukturell (niedriges Risiko), geeignet für Vertrauensaufbau

## 7. Testplan

### 7.1 Unit-Tests für `sdk.ts`

- ✅ `UndiciInstrumentation` in `NodeSDK`'s `instrumentations` vorhanden
- ✅ `ignoreRequestHook` gibt `true` zurück für `https://collector:4318/v1/traces`
- ✅ `ignoreRequestHook` gibt `false` zurück für `https://dashscope.aliyuncs.com/...`
- ✅ Korrekte Übereinstimmung mit und ohne trailing slash

### 7.2 Unit-Tests für `llm-correlation-fetch.ts`

**`wrapFetchWithCorrelation`**:

| Szenario                                                | Erwartung                                                                             |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | wrapped fetch = baseFetch (kein Header hinzugefügt)                                   |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | Wrapped fetch fügt `X-Qwen-Code-Session-Id: abc-123` in `init.headers` ein            |
| `init.headers` enthält bereits `X-Qwen-Code-Session-Id: spoof` | Wrapper überschreibt mit echter SessionId (im Fetch-Wrapper-Pfad kein Spoofing möglich, §8.1) |
| **Nach Session-Reset wird wrapped fetch erneut aufgerufen** | **Liest neue SessionId** (Regression-Guard für Staleness-Fix)                         |
| baseFetch lehnt ab                                      | Wrapper gibt reject unverändert weiter                                                 |

**`staticCorrelationHeaders`** (Gemini-Pfad):

| Szenario                                                | Erwartung                                                       |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| `getTelemetryEnabled() === false`                       | `{}`                                                            |
| `getTelemetryEnabled() === true`, sessionId = "abc-123" | `{ 'X-Qwen-Code-Session-Id': 'abc-123' }`                       |
| sessionId enthält Unicode (`會話-1`)                     | Wird unverändert zurückgegeben – HTTP-Header-Wert wird vom SDK kodiert |
| sessionId ist leerer String                              | `{ 'X-Qwen-Code-Session-Id': '' }` – Geschäftsinvariante, wird in dieser Schicht nicht validiert |

### 7.3 Integrationstests pro Provider

Tests für `buildHeaders()` / Konstruktor jedes Providers hinzufügen:

```ts
it('enthält X-Qwen-Code-Session-Id bei aktiviertem Telemetry', () => {
  const config = makeFakeConfig({
    sessionId: 'sess-xyz',
    telemetry: { enabled: true },
  });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()['X-Qwen-Code-Session-Id']).toBe('sess-xyz');
});

it('lässt X-Qwen-Code-Session-Id weg bei deaktiviertem Telemetry', () => {
  const config = makeFakeConfig({ telemetry: { enabled: false } });
  const provider = new DefaultProvider(genConfig, config);
  expect(provider.buildHeaders()).not.toHaveProperty('X-Qwen-Code-Session-Id');
});
```

### 7.4 E2E-Verifikation (tmux + lokaler HTTP-Server)

⚠️ **Nicht** `globalThis.fetch` mocken, um Header zu erfassen: `UndiciInstrumentation` hooked über undici's diagnostics channel; Monkey-Patching von `globalThis.fetch` könnte die Instrumentierung komplett umgehen (abhängig von der Patch-Reihenfolge), sodass die `traceparent`-Injektion nicht testbar ist. **Korrekt: Lokalen HTTP-Server starten**, das SDK echte Anfragen senden lassen, die empfangenen Header serverseitig protokollieren.

Ein Skript analog zu `/tmp/verify-telemetry-pr-4367.mjs` schreiben:

1. `http.createServer((req, res) => { capturedHeaders.push(req.headers); res.end('{}') })` – lokalen Server starten
2. Telemetry aktivieren + outfile + `baseURL` des OpenAI-SDKs auf `http://127.0.0.1:<port>` setzen (oder Mock-Provider verwenden, der echten Fetch ausführt)
3. Einmal `client.chat.completions.create(...)` auslösen (mit minimaler parsbarer Mock-Antwort, sonst gibt SDK Parse-Fehler – lokaler Server gibt gültige, aber leere OpenAI-Antwort zurück)
4. Assertion: `capturedHeaders[0]` enthält `traceparent: 00-...` und `X-Qwen-Code-Session-Id: <sessionId>`
5. Einen weiteren OTLP-Collector-Mock auf anderem Port starten, verifizieren, dass der OTLP-Report **keine** `traceparent`-Injektion auslöst (überprüft `ignoreRequestHook`)
6. **Zusätzlich: Staleness-Verifikation** — request 1 auslösen → `config.resetSession(...)` aufrufen → request 2 auslösen → Assertion, dass `X-Qwen-Code-Session-Id` in request 2 die neue Session-ID ist (**kritischer Regressionstest für Fix #1**)

### 7.5 Regression-Schutz

- Streaming Chat Completion (mit `stream: true`): Fetch wird normal geschlossen – `UndiciInstrumentation` hatte historisch Bugs im Span-Lifecycle von Streaming-Responses. **Bei der Implementierung einen echten Streaming-Completion End-to-End laufen lassen**, um normale Span-Beendigung + kein Leck + Stream nicht unterbrochen zu verifizieren; nicht auf fixierte Version annehmen.
- Proxy Mode (`ProxyAgent`) und Instrumentierung gleichzeitig aktiv: `ignoreRequestHook` matcht weiterhin anhand des Endpoint-Strings, Proxy beeinflusst nicht
- Retry (`maxRetries`): Jeder Retry erhält einen eigenen Client-Span, aber alle teilen sich denselben `traceparent`-Parent (idealerweise Retry als mehrere Child-Spans unter einem Parent – das Verhalten liegt beim SDK, wird hier nicht erzwungen)

## 8. Grenzfälle / Randfälle

### 8.1 Inkonsistentes Verhalten von customHeaders-Override und Spoofing

Das Spoofing verhält sich je nach Provider-Pfad **unterschiedlich** (Design-Folge, nicht beabsichtigt verschärft):

| Provider-Pfad                        | Spoofing möglich? | Grund                                                                                                                    |
| ------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| OpenAI / Anthropic (Fetch-Wrapper)    | ❌ Nicht möglich  | Fetch-Wrapper setzt `headers.set('X-Qwen-Code-Session-Id', ...)` nach der SDK-Header-Liste, überschreibt gleichnamigen customHeaders |
| Gemini (Static-Headers-Pfad)          | ✅ Möglich        | Merge-Reihenfolge `{ ...baseHeaders, ...correlationHeaders, ...customHeaders }` – customHeaders gewinnt zuletzt        |

Claude-Code verwendet ebenfalls den Fetch-Wrapper-Pfad, Verhalten identisch mit OpenAI/Anthropic (kein Spoofing). Dies ist ein Nebenprodukt des Staleness-Bug-Fixes, nicht ursprünglich beabsichtigt.

**Keine Ausrichtung** der beiden Pfade geplant – das Verhalten des Gemini-Pfads ist eine SDK-Einschränkung (kein `fetch`-Hook), es wäre unsinnig, OpenAI auf statisch zurückzustufen.

Session-ID-Spoofing ist keine echte Bedrohung (der Benutzer kontrolliert das Lokale, kann direkt den Quellcode ändern). Der Unterschied muss in der Dokumentation klar gemacht werden, damit Reviewer nicht die Priorität von customHeaders anzweifeln, wenn der Fetch-Wrapper-Pfad kein Spoofing zulässt.

### 8.2 Zwei Edge Cases bei OTLP-Collector-URL-Abgleich

#### (a) Auth-Token in der URL

Wenn der OTLP-Endpoint wie `https://collector/path?token=secret` aussieht, vergleicht `ignoreRequestHook` mit `url.startsWith(e)`. Das `request.path` von undici enthält jedoch nur den Pfad (ohne Query). Um sicher zu gehen, die Query abschneiden:

```ts
const otlpUrls = [...]
  .map((u) => u.replace(/\?.*$/, '').replace(/\/$/, ''));
```

#### (b) Theoretischer False Positive bei startsWith über Hostname-Grenze hinweg

Wenn `e = "http://collector"` (ohne Port), wird `http://collector-fake/v1/traces` fälschlicherweise von `startsWith` erkannt.

**Tatsächliche Wahrscheinlichkeit extrem gering**:

- OTLP-Endpoint fast immer mit Port (4317 gRPC / 4318 HTTP); Format `http://collector:4318` – eine Erweiterung mit `-fake` ist unmöglich (nach Port folgt `/`)
- Benutzer, die Endpoint ohne Port konfigurieren, machen einen Konfigurationsfehler; das SDK würde ohnehin den Standard-Fallback verwenden

**Zum Härten**: URL-Origin und Pfad getrennt vergleichen, statt rohem `startsWith`:

```ts
const parsed = otlpUrls.map((u) => new URL(u));
return parsed.some(
  (e) =>
    `${request.origin}` === e.origin && request.path.startsWith(e.pathname),
);
```

Wird in dieser Runde nicht gemacht – Overhead unnötig, False Positive tritt in der Praxis nicht auf.

### 8.3 Vertex-AI-Modus von Gemini

`@google/genai` unterstützt den `vertexai: true`-Modus (mit GCP-Anmeldedaten über Vertex-Endpoint statt Generative-AI-Endpoint). Beide Modi verwenden `fetch`, die Instrumentierung deckt beide ab. `httpOptions.headers` funktioniert in beiden Modi.

### 8.4 Anthropic SDK hat bereits `defaultHeaders`-Logik

`anthropicContentGenerator.ts:177` ruft bereits `buildHeaders()` auf und übergibt es an `new Anthropic({ defaultHeaders })`. Das Staleness-Problem gilt aber ebenfalls – dieser Entwurf wechselt daher auf den `fetch`-Wrapper-Pfad (wie OpenAI).

### 8.5 Trailer-Header zwischen SDK und Fetch

Das `openai` SDK verwendet bei Streaming möglicherweise `Transfer-Encoding: chunked` und Trailer-Header. Diese beeinflussen nicht die Request-Time-Injektion von `traceparent` / `X-Qwen-Code-Session-Id` – sie sind Request-Header und werden einmalig beim Senden gesetzt.

### 8.6 ⚠️ Bekannte Einschränkung: Geminis Session-ID ist nach `/clear` veraltet

Da das `@google/genai` SDK keinen `fetch`-Hook unterstützt (das `HttpOptions`-Interface enthält nur `baseUrl`/`apiVersion`/`headers`/`timeout`/`extraParams`), verwendet der Gemini-Provider den statischen `httpOptions.headers`-Pfad – die Session-ID wird beim SDK-Konstruktionszeitpunkt erfasst und **nach `/clear` nicht aktualisiert**.

**Tatsächlicher Einflussbereich**:

- Benutzer startet qwen-code → `/clear` → verwendet Gemini-Modell → `X-Qwen-Code-Session-Id` auf der Leitung ist die alte Session-ID
- Backend-Korrelation stimmt nicht mehr (Trace-ID und Logs sind korrekt auf neue Session umgeschaltet, aber der Wire-Header hinkt hinterher)

**Warum nicht behoben** (in dieser Runde):

- OpenAI / Anthropic-Pfad **hat diesen Bug nicht** (Fetch-Wrapper liest Session-ID pro Request)
- Gemini-Fix-Pfad hat mehrere Optionen, alle außerhalb des aktuellen Scopes (siehe unten)

**Zukünftige Fix-Pfad-Optionen** (in empfohlener Reihenfolge):

| Option                         | Beschreibung                                                                                        | Aufwand                                                                                         |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A. Lazy Invalidate** ★ empf. | Bei Session-Reset nur ContentGenerator als schmutzig markieren, bei nächstem LLM-Aufruf lazy neu erstellen | Klein: ~10 Zeilen in `resetSession` + LLM-Einstiegspunkt; synchrone API, nicht invasiv          |
| B. Eager Recreate              | Bei Session-Reset sofort `await createContentGenerator(...)`, `resetSession` muss async werden       | Mittel: API-Änderung kaskadiert an mehreren Stellen                                             |
| C. Proxy-Headers-Objekt        | `httpOptions.headers` mit Proxy um `get` abzufangen                                                  | Hohes Risiko: Ob `@google/genai` intern Header pro Request neu liest, ist unbekannt; Verhalten könnte silently brechen |
| D. Push für `fetch`-Option upstream | PR an google-deepmind/generative-ai-js                                                              | Langfristig; nicht kontrollierbar                                                               |

**Dokumentation muss dem Benutzer erklären**: Bei Verwendung des Gemini-Providers, wenn direkt nach `/clear` ein LLM-Aufruf erfolgt, ist die Session-ID auf der Leitung für diesen Moment veraltet. Dies kann indirekt über Trace-Korrelation korrigiert werden (Session-ID in Spans/Logs ist bereits neu).

Ein separates Follow-Up-Sub-Issue für Option A sollte erstellt werden.

## 9. Vergleich mit claude-code

| Dimension                       | claude-code                                                                                                                                        | qwen-code (dieses Design)                                                                                                                                                                                | Entscheidungsgrundlage                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Session-ID-Header-Name          | `X-Claude-Code-Session-Id` (Produktpräfix)                                                                                                         | `X-Qwen-Code-Session-Id` (Produktpräfix)                                                                                                                                                                 | ✅ Gleiche Namensraum-Strategie                                                                                                            |
| Session-ID-Injektionsmechanismus| SDK `defaultHeaders` (`client.ts:108`) + benutzerdefinierter `buildFetch()` Wrapper (`client.ts:370-390`, per-Request `randomUUID()` für `x-client-request-id`) | OpenAI/Anthropic über Fetch-Wrapper (pro Request Session-ID lesen, verhindert `/clear`-Staleness); Gemini über statische `httpOptions.headers` (SDK-Einschränkung)                                      | Gleich wie Fetch-Wrapper-Modus von claude-code. Claude-Code verwendet Fetch-Wrapper ebenfalls für per-Request `x-client-request-id`         |
| Session-ID-Persistenz           | Claude-Code hat kein `/clear`-Reset; Session = Prozess                                                                                            | Hat `/clear`-Reset → Fetch-Wrapper-Pfad folgt automatisch; Static-Headers-Pfad wird veraltet (§8.6)                                                                                                     | Qwen-Code-spezifische Komplexität                                                                                                          |
| Session-ID-Kodierung            | HTTP-Header (kein baggage)                                                                                                                        | HTTP-Header                                                                                                                                                                                              | ✅ Gleich – backend-freundlich                                                                                                             |
| `traceparent`-Injektion         | Geschlossen; öffentliche Docs beschreiben Existenz; Open-Source-Repo ohne `propagation.inject` / `UndiciInstrumentation`-Referenz                | `@opentelemetry/instrumentation-undici` automatisch                                                                                                                                                      | Wie claude-code implementiert, ist nicht sichtbar. Wir wählen den offiziellen OTel-Weg, leichter.                                         |
| `traceparent`-Sendungsbereich   | Nur First-Party Anthropic API; nicht an Bedrock/Vertex/Foundry                                                                                    | An alle ausgehenden Fetch-Anfragen (W3C-Standard; Trace-ID ist `sha256(sessionId)`-Hash). **R3-Überarbeitung**: Session-ID-Header nur an First-Party (Alibaba/DashScope)-Allowlist injiziert, Drittanbieter standardmäßig nicht. Siehe §11 | Nach R3 hat qwen-code die gleiche First-Party-only-Semantik für Session-Header wie claude-code; `traceparent` bleibt als per-destination-Toggle-Follow-Up |
| `x-client-request-id` (zufällig)| Ja, automatisch                                                                                                                                  | Vorerst nicht (separates Follow-Up-Sub-Issue hat mehr Wert)                                                                                                                                              | Umfangskontrolle                                                                                                                           |
| `TRACEPARENT`-Env in Subproz.   | Dokumentation gibt Existenz an (Implementierung geschlossen)                                                                                     | Nicht umgesetzt (separates Follow-Up)                                                                                                                                                                    | Umfangskontrolle                                                                                                                           |
| Eingehende `TRACEPARENT`-Lesung | Dokumentation gibt Existenz an (`-p` / Agent SDK Mode)                                                                                           | Nicht umgesetzt (separates Follow-Up)                                                                                                                                                                    | Umfangskontrolle                                                                                                                           |

**Anmerkung zu "verified vs. documented"** :

| Behauptung                                      | Verifikationsstatus                                                                                                                            |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Claude-Code-Session-Id` via `defaultHeaders` | ✅ Open Source `src/services/api/client.ts:108` gelesen                                                                                        |
| `x-client-request-id` via Fetch-Wrapper        | ✅ Open Source `src/services/api/client.ts:370-390` gelesen                                                                                    |
| `traceparent`-Injektion                         | ⚠️ Nur docs.claude.com/docs/en/monitoring-usage.md erwähnt; Open-Source-Repo `grep -rn "propagation\.inject\|UndiciInstrumentation\|traceparent" src` liefert nichts |
## 10. Zukünftige Arbeiten

Hängt an #3731 P3 ab; dieses Design enthält **nicht**, ist aber verwandt mit:

- **`X-Qwen-Code-Request-Id`** – zufällige UUID pro Request (claude-code-Äquivalent: `x-client-request-id`). Nützlich für Timeout/Fehlerkorrelation – bei Timeouts hat der Server möglicherweise noch keine Request-ID vergeben, die vom Client vorab gesendete ID ist das einzige Korrelationsmittel. Nach der R3-Überarbeitung wird dieser Vorschlag sinnvoller: ein pro-Request-UUID birgt kein Risiko der "anfrageübergreifenden Verhaltensprofilierung" und kann als universeller "Support-/Debug-Header" an alle LLM-Provider gesendet werden.
- **Per-Destination-Scope-Toggle für `traceparent`** – R3-Überarbeitung behandelt nur den Scope der Session-ID-Header; `traceparent` wird weiterhin in alle ausgehenden Fetch-Aufrufe injiziert. Es könnte ein `telemetry.propagateTraceContext: 'trusted-hosts' | 'all' | 'none'` hinzugefügt werden, das mit derselben Allowlist aus §11 das Verhalten steuert.
- **Lazy-Invalidate für Session-ID-Staleness bei Gemini (Option A aus §8.6)**: Bei `/clear` wird `contentGenerator` als "dirty" markiert, beim nächsten LLM-Aufruf erfolgt lazy Neuerstellung. Dadurch profitiert auch der Gemini-Pfad von der Echtzeitfähigkeit des Fetch-Wrappers.
- **Umgebungsvariable `TRACEPARENT` für Unterprozesse**: Injiziert Umgebungsvariablen bei der Ausführung von Unterprozessen durch `BashTool`, sodass externe Tools die Trace fortsetzen können. Erfordert separate Betrachtung des Tool-Ausführungslebenszyklus.
- **Eingehender `TRACEPARENT`**: Im `--prompt`-Modus beim Start die Umgebungsvariable auslesen, damit CI / externe Orchestratoren qwen-code in einen größeren Trace einbinden können.
- **Konfigurierbarer `correlationHeader`-Name**: Ermöglicht Unternehmen, den Header anzupassen (Standard: `X-Qwen-Code-Session-Id`).
- **`baggage`-Propagationsstrategie**: Ob aktiv `baggage` gesetzt wird, damit `user.id` / `tenant.id` etc. ebenfalls über `baggage` an nachgelagerte Dienste weitergegeben werden. In dieser Runde nicht umgesetzt, abwarten bis Anforderungen klarer sind.

## 11. R3-Überarbeitung – Host-Allowlist-Scoping für `X-Qwen-Code-Session-Id`

> Auslöser: [LaZzyMan's REQUEST_CHANGES-Review in PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Umsetzung in Commits: `1c8528a56` (Kernimplementierung) + `cb162e716` (Vertex baseUrl fail-closed + `["*"]`-Trim-Fehlerbehandlung)

### 11.1 Auslöser und Begründung

Das R1-Design injizierte `X-Qwen-Code-Session-Id` in **alle** ausgehenden LLM-Anfragen, gesteuert nur durch `telemetry.enabled`. LaZzyMan's Review zeigte drei zunehmend schwerwiegende Probleme auf:

1.  **Fehlerhafte Etikettierung**: `feat(telemetry):` + `telemetry/`-Pfad + `getTelemetryEnabled()`-Gate lassen Benutzer zu Recht annehmen, dass "eigene Observability-Daten zum eigenen Collector fließen". Aber `X-Qwen-Code-Session-Id` erreicht kein OTLP-Backend; es wird in LLM-API-Anfragen an DashScope / OpenAI / Anthropic / Gemini / OpenRouter / MiniMax / ModelScope / Mistral gesendet. Zwei unterschiedliche Datenabfluss-Entscheidungen sind an einen einzigen Schalter gekoppelt.

2.  **Die Analogie zu claude-code trifft nicht zu**: R1 hat in §9 sowohl die Namespace-Strategie als auch das Fetch-Wrapper-Muster an claude-code "angeglichen". Aber claude-code ist eine Einbahnstraße von Anthropic → Anthropic (ein Anbieter, eine Richtung), während qwen-code ein Open-Source-CLI → mehrere Drittanbieter-Provider ist. "Eine stabile, anfragenübergreifende UUID an alle Drittanbieter senden" – das ist eine Frage, die R1 nicht direkt beantwortet hat.

3.  **traceparent ist ein weiterer Kanal für denselben Fingerabdruck**: Die Trace-ID = `sha256(sessionId).slice(0, 32)` ist für den Empfänger weiterhin ein stabiler, session-bezogener Identifikator (nach dem Hashing nicht umkehrbar, aber innerhalb derselben Session stabil).

LaZzyMan bewertete den Schweregrad: Session-ID `high` / traceparent `medium`.

### 11.2 Lösungsübersicht

**Verkleinerung des Standard-Gültigkeitsbereichs auf First-Party-Hosts**. Ein neuer Eintrag wird hinzugefügt:

```jsonc
"telemetry": {
  "sessionIdHeaderHosts": ["*"]                          // Stellt R1-Broadcast-Verhalten wieder her
  "sessionIdHeaderHosts": []                              // Header vollständig deaktivieren
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

Die Semantik dieser Sammlung ist: "LLM-Provider, ARMS-Tracing-Backend, qwen-code-Distribution unter derselben juristischen Person" – also die Entsprechung der claude-code-Einbahnstraße (Single-Vendor / Single-Direction) für qwen-code. Drittanbieter-Provider (OpenAI / Anthropic / OpenRouter / usw.) empfangen den Header standardmäßig **nicht**.

### 11.3 Pattern-Syntax (bewusst klein)

`matchesTrustedHost(hostname, patterns)` unterstützt nur zwei Muster, abgestimmt auf `DashScopeOpenAICompatibleProvider.isDashScopeProvider`:

- plain hostname → exakter Vergleich (case-insensitive)
- `*.suffix` → matcht `suffix` selbst **UND** beliebige Subdomains; punktverankert, um Typo-Squatting-Angriffe wie `evil-alibaba-inc.com` / `alibaba-inc.com.attacker.tld` zu verhindern

Keine Regex, keine Port-/Schema-abhängigen Globbing-Muster – der String in den Einstellungen ist genau das, was er aussieht.

### 11.4 Implementierungsunterschiede vs. R1

#### `wrapFetchWithCorrelation` (OpenAI / Anthropic)

R1's Wrapper hatte nur zwei Gates: Telemetry aktiviert + Session-ID vorhanden. R3 fügt zwischen diesen ein drittes Gate ein:

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

`trustedHosts` wird beim Wrapping einmalig als Snapshot erfasst (anders als die Session-ID, die "pro Anfrage live gelesen" wird). Eine nachträgliche Änderung von `telemetry.sessionIdHeaderHosts` erfordert einen Neubau des `contentGenerator`, um wirksam zu werden. Schreibweisen wie `[" * "]` mit Leerzeichen werden durch `.trim()` als Broadcast behandelt, um stille Fehlfunktionen durch Tippfehler in `settings.json` zu vermeiden.

#### `staticCorrelationHeaders` (Gemini)

Die Signatur erhält einen zusätzlichen Parameter `destinationUrl?: string`:

```ts
export function staticCorrelationHeaders(
  config: Config,
  destinationUrl?: string,
): Record<string, string> {
  if (!config.getTelemetryEnabled()) return {};
  if (!destinationUrl) return {}; // fail-closed: Ziel unbekannt -> kein Senden
  if (!matchesTrustedHost(new URL(destinationUrl).hostname, trustedHosts)) {
    return {};
  }
  return { [SESSION_ID_HEADER]: config.getSessionId() };
}
```

#### Gemini-Factory-Integration

Das Gemini SDK hat zwei unsichtbare Standard-Endpunkte (`generativelanguage.googleapis.com` und `{region}-aiplatform.googleapis.com`, bestimmt durch `vertexai`), die die Factory-Ebene nicht genau rekonstruieren kann. R3 wählt: "Wenn `config.baseUrl` nicht gesetzt ist, wird `undefined` übergeben", sodass der Helper fail-closed → keinen Header sendet. Betreiber, die Korrelation wünschen, müssen explizit eine `baseUrl` setzen (dieselbe Eingabe, die das SDK selbst zur Auflösung des Ziels verwendet). Diese Änderung verhindert, dass ein fälschlich erratenes Vertex-Ziel fälschlicherweise von der Allowlist erfasst wird.

### 11.5 Neue Dateien / Neuer Code

| Datei                                                                | Beschreibung                                                                                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/trusted-llm-hosts.ts` (NEU)             | `DEFAULT_SESSION_ID_HEADER_HOSTS` + `matchesTrustedHost` + `extractRequestHost`                                                           |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts` (NEU)        | Unit-Tests, inkl. TLD-Suffix-Angriffsvektoren, IPv6 fail-closed, Port/Userinfo/Query-Extraktion                                          |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`               | Host-Gate hinzugefügt; `staticCorrelationHeaders` erhält Parameter `destinationUrl`                                                       |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`          | 8 Testfälle für Host-Gate; `mockConfig` unterscheidet "default allowlist" vs "broadcast" mittels `'hosts' in opts`                        |
| `packages/core/src/telemetry/config.ts` (`resolveTelemetrySettings`) | Durchreichen von `sessionIdHeaderHosts`                                                                                                   |
| `packages/core/src/config/config.ts`                                 | `TelemetrySettings.sessionIdHeaderHosts` + `getTelemetrySessionIdHeaderHosts()`-Getter                                                    |
| `packages/core/src/core/geminiContentGenerator/index.ts`             | Übergibt `config.baseUrl` an Helper; fail-closed bei `undefined`                                                                          |
| `packages/core/src/core/geminiContentGenerator/index.test.ts`        | Überarbeitung der Telemetry-on-Gemini-Tests zur Anpassung an die neue fail-closed-Semantik                                                |
| `packages/cli/src/config/settingsSchema.ts`                          | Einstiegspunkt für `sessionIdHeaderHosts` im JSON-Schema                                                                                  |
| `packages/vscode-ide-companion/schemas/settings.schema.json`         | Neu generiert durch `npm run generate:settings-schema`                                                                                    |
| `docs/developers/development/telemetry.md`                           | Abschnitt "Session correlation header" umgeschrieben: Standard-Scope + Override-Syntax                                                    |

### 11.6 Antworten zu LaZzyMans Argumenten

| LaZzyMans Argument                       | R3-Antwort                                                                                                                                                                                 |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① Fehlerhafte Telemetry-Etikettierung   | **Entschärft:** Im DashScope-Anwendungsfall wird der Session-ID-Header buchstäblich an das ARMS-Tracing-Backend gesendet (gleiche juristische Person); die Semantik von `telemetry.enabled` ist konsistent |
| ② Broadcast eines anbieterübergreifenden stabilen Identifikators | **Entschärft:** Standard-Allowlist enthält nur Alibaba-First-Party-Hosts; Broadcast wird zum Opt-in (`["*"]`)                                                                             |
| ③ traceparent als weiterer Kanal für denselben Fingerabdruck | **Vorläufig beibehalten:** traceparent wird weiterhin wie in R1 vollständig injiziert. Grund: W3C-Standard, Trace-ID ist SHA-256-Hash, In-Vendor-Trace-Fortsetzung ist Kernanwendungsfall von W3C. Per-Destination-Toggle für traceparent in §10 als zukünftige Arbeit aufgenommen |

### 11.7 Bekannte Restpunkte + Nachverfolgung

- **traceparent-Scope** – siehe Punkt ③ oben, aufgenommen in §10
- **Pro-Request-Zufalls-UUID** (`X-Qwen-Code-Request-Id`) – von LaZzyMan vorgeschlagene Alternative, aufgenommen in §10
- **Gemini-Staleness-Lazy-Invalidate** (Option A in §8.6) – von R3 entkoppelt, eigenes Sub-Issue
- **`matchesTrustedHost` IPv6-Unterstützung** – Aktuell werden IPv6-Ziele niemals in der Allowlist gematcht (`URL.hostname` gibt `[::1]` mit eckigen Klammern zurück, und die Pattern-Syntax hat keine entsprechende Form). Für den aktuellen Anwendungsfall "benannte First-Party-Endpunkte" ausreichend. Falls zukünftig rohe IP-Allowlists benötigt werden, wird erweitert.

## 12. R4-Überarbeitung – Aufteilung der Scope-Vermischung

> Auslöser: [LaZzyMans round-8 follow-up Review zu PR #4390](https://github.com/QwenLM/qwen-code/pull/4390)
> Umsetzung: Dieser PR verkleinert den Umfang; das gesamte in R3 umgesetzte Session-ID-Paket wird in einen separaten Folge-PR verschoben

### 12.1 Auslöser und Begründung

R3 hatte LaZzyMans Bedenken aus der ersten Review bezüglich des "Sendens stabiler Fingerabdrücke an Drittanbieter" entkräftet (Schweregrad: hoch). In der Round-8-Follow-up-Review eskalierte er jedoch zu einem grundlegenderen Architekturprinzip:

> "Telemetry ist kein Container für benachbarte Funktionen. Die `traceparent`-prozessübergreifende Propagation und die `X-Qwen-Code-Session-Id`-Header-Injektion sind **keine Telemetrie**. Sie sind Outbound-Identity-/Outbound-Correlation-Arbeit, die intern einige OTel-APIs als Implementierungsdetail nutzt."

Sein Kernargument:

- **Der Namespace "telemetry" suggeriert einen Empfänger = den eigenen OTLP-Collector des Benutzers**
- Aber die Empfänger von `traceparent` und `X-Qwen-Code-Session-Id` sind **Drittanbieter-LLM-Provider**
- Zwei verschiedene Arten von Empfängern sollten zwei verschiedene Arten von Zustimmungsentscheidungsbäumen haben
- Selbst wenn das Standardverhalten sicher ist (wie in R3 umgesetzt), setzt das Ablegen von Wire-Level-Verhalten unter `telemetry.*` **einen schlechten Präzedenzfall**: Zukünftige Telemetry-PRs könnten weiterhin Wire-Verhalten an Dritte einschmuggeln
- "Wenn wir dieses Prinzip akzeptieren, ist die Aufteilung mechanisch. Wenn nicht, ist dieser PR der falsche Ort für diese Debatte, da die technischen Korrekturen bereits vorhanden sind."

### 12.2 Lösungsübersicht ("Lösung C" hybride Aufteilung)

Nach mehreren internen Diskussionen (einschließlich yiliangs Vorschlag eines customHeader-Templates, das jedoch als nicht geeignet für die Übergabe von zur Laufzeit dynamischen Werten befunden wurde) fiel die Entscheidung auf **Lösung C**:

**Dieser PR behält**:

- Die Registrierung von `UndiciInstrumentation` (erzeugt Client-HTTP-Spans → eigener OTLP-Collector des Benutzers)
- Die OTLP-Feedback-Loop-Absicherung (notwendiger Nebeneffekt des Ersteren)
- **Standardmäßige Installation von `NoopTextMapPropagator`** → `propagation.inject()` ist No-op → auf ausgehenden `fetch`-Aufrufen **gibt es kein `traceparent` mehr**
- **Neue Einstellung `outboundCorrelation.propagateTraceContext: bool` (Standardwert false)** als Top-Level-Einstellung im neuen Namespace; bei `true` wird der Standard-W3C-Composite-Propagator installiert
- Das gesamte **R3-Session-ID-Paket** (`llm-correlation-fetch.ts` / `trusted-llm-hosts.ts` / Setting `telemetry.sessionIdHeaderHosts` / 4 Provider-Integrationspunkte / alle zugehörigen Tests) wird **komplett entfernt**

**Verschiebung in einen Folge-PR**:

- Die gesamte Mechanik von `X-Qwen-Code-Session-Id` (Wiederverwendung der R3-Implementierung)
- Einzug in den neuen Namespace `outboundCorrelation.*` (konkreter Setting-Key noch offen, wird aber **nicht** `telemetry.*` heißen)
- Der Folge-PR enthält: eigenen Bedrohungsmodell-Abschnitt, unabhängige Review, sicherheitsrelevante Dokumenation
- `X-Qwen-Code-Request-Id` pro Request-UUID (LaZzyMans Alternativvorschlag aus R3-Runde) wird ebenfalls in diesem Folge-PR berücksichtigt

### 12.3 Abbildung der R1/R3-Argumente

| R1/R3-Argument                                                | Status nach R4                                                                                                         |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| §3.1 "Alle ausgehenden LLM-Anfragen erhalten traceparent"     | ❌ **R4: standardmäßig aus**; benötigt `outboundCorrelation.propagateTraceContext: true`                                |
| §3.1 "Alle ausgehenden LLM-Anfragen erhalten `X-Qwen-Code-Session-Id`" | ❌ **R4: komplett aus diesem PR entfernt**, in Folge-PR verschoben                                          |
| §4.3 Fetch-Wrapper injiziert Session-ID                       | ❌ Der gesamte Code ist nicht in diesem PR; wird im Folge-PR wiederverwendet                                           |
| §11 Host-Allowlist (R3-Design)                                | ❌ Gleichermaßen; vollständig in Folge-PR verschoben                                                                    |
| §4.4 Kein neues Setting                                       | ❌ **Dieser PR führt `outboundCorrelation.propagateTraceContext`** (ein boolescher Wert) ein; Session-ID-bezogene Settings im Folge-PR |
| §10 Zukünftige Arbeit "`X-Qwen-Code-Request-Id`"              | ✅ Bleibt zukünftige Arbeit; Design gemeinsam mit Session-ID-Folge-PR                                                   |

### 12.4 Designabsicht des neuen Namespace

Der Top-Level-Namespace `outboundCorrelation.*` hat in diesem PR nur einen booleschen Wert (`propagateTraceContext`), was überstrukturiert erscheinen mag. Dies ist jedoch **bewusst gewählt**:

- **Schafft den Namespace als Versprechen**: Nachfolgende Session-ID / Request-ID / usw. können auf natürliche Weise in diesen Namespace einfließen
- **Als sicherheitsrelevant markiert**: Die `settingsSchema.ts`-Beschreibung enthält explizit "SECURITY-RELEVANT", dokumentiert als "Sicherheitseinstellung" und nicht als "Observability-Einstellung"
- **Standardmäßig alles aus**: Entspricht LaZzyMans Prinzip: "Ein Open-Source-Client sollte ohne explizite Zustimmung keine stabilen Identifikatoren an Dritte senden."
- **Entkoppelt von `telemetry.*`**: Benutzer, die `settings.json` lesen, erkennen sofort, dass `outboundCorrelation.*` das ausgehende Wire-Verhalten betrifft, nicht die Observability

#### Implizite Abhängigkeit: `telemetry.enabled`

Obwohl der Namespace von `telemetry.*` entkoppelt ist, hängt die **Laufzeitwirkung dennoch von `telemetry.enabled: true`** ab – das OTel-SDK wird nur initialisiert, wenn Telemetrie aktiviert ist. Ohne SDK gibt es keine Propagator-Installation, keinen `propagation.inject()`-Aufruf; das Flag bleibt stumm (No-op). Ein leicht zu übersehendes Footgun: Ein Betreiber setzt `propagateTraceContext: true`, vergisst aber, Telemetrie zu aktivieren. Der Trap-Server sieht kein `traceparent`, kein Fehler, keine Warnung.

Beide benutzerorientierten Oberflächen kennzeichnen diese Abhängigkeit explizit:

- Der Abschnitt `propagateTraceContext` in `telemetry.md` enthält ein vollständiges JSON-Beispiel mit beiden Flags
- Die Beschreibung in `settingsSchema.ts` beginnt **im ersten Satz** mit "Requires `telemetry.enabled: true`" (damit sie auch dann sichtbar ist, wenn die lange Beschreibung in der VS-Code-Einstellungs-UI eingeklappt ist)

Sollten zukünftig Session-ID-Header oder andere `outboundCorrelation.*`-Einstellungen hinzugefügt werden, **gilt dieselbe Abhängigkeit** – sie sind nur sinnvoll, wenn Telemetrie aktiviert ist (da sie alle über das OTel-Instrumentierungs-/SDK injiziert werden). Der Folge-PR sollte dieses Footgun-Hinweis-Muster übernehmen.

### 12.5 Umsetzung

| Datei                                                                               | Änderungen                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/telemetry/llm-correlation-fetch.ts`                              | **Gelöscht**                                                                                                                                                                                                                                    |
| `packages/core/src/telemetry/llm-correlation-fetch.test.ts`                         | **Gelöscht**                                                                                                                                                                                                                                    |
| `packages/core/src/telemetry/trusted-llm-hosts.ts`                                  | **Gelöscht**                                                                                                                                                                                                                                    |
| `packages/core/src/telemetry/trusted-llm-hosts.test.ts`                             | **Gelöscht**                                                                                                                                                                                                                                    |
| `packages/core/src/telemetry/sdk.ts`                                                | + `NoopTextMapPropagator`; Bestimmung des SDK-textMapPropagator basierend auf `getOutboundCorrelationPropagateTraceContext()`                                                                                                                 |
| `packages/core/src/core/openaiContentGenerator/provider/default.ts`                | Entfernung der Referenz auf `wrapFetchWithCorrelation`                                                                                                                                                                                          |
| `packages/core/src/core/openaiContentGenerator/provider/dashscope.ts`               | Selbiges                                                                                                                                                                                                                                        |
| `packages/core/src/core/anthropicContentGenerator/anthropicContentGenerator.ts`     | Selbiges                                                                                                                                                                                                                                        |
| `packages/core/src/core/geminiContentGenerator/index.ts`                            | Entfernung der Referenz auf `staticCorrelationHeaders`                                                                                                                                                                                          |
| `*.test.ts` der obigen 4 Provider                                                   | Löschung der Session-ID-bezogenen Testfälle                                                                                                                                                                                                     |
| `packages/core/src/config/config.ts`                                                | Löschung von `TelemetrySettings.sessionIdHeaderHosts` und `getTelemetrySessionIdHeaderHosts`; **Neu: Schnittstelle `OutboundCorrelationSettings` + Feld `outboundCorrelationSettings` + Getter `getOutboundCorrelationPropagateTraceContext()`** |
| `packages/core/src/telemetry/config.ts`                                             | Löschung der Durchleitung von `sessionIdHeaderHosts` in `resolveTelemetrySettings`                                                                                                                                                              |
| `packages/cli/src/config/settingsSchema.ts`                                         | Löschung des `sessionIdHeaderHosts`-Schemas; **Neu: Top-Level-Schema-Eintrag `outboundCorrelation`**                                                                                                                                            |
| `packages/cli/src/config/config.ts`                                                 | Durchleitung von `outboundCorrelation: settings.outboundCorrelation` in `ConfigParameters`                                                                                                                                                      |
| `packages/vscode-ide-companion/schemas/settings.schema.json`                        | Neu generiert durch `npm run generate:settings-schema` (bei späteren Beschreibungsaktualisierungen synchron aktualisieren)                                                                                                                      |
| `docs/developers/development/telemetry.md`                                          | "Trace context propagation" umgeschrieben zu "Client-side HTTP span on outbound fetch"; gesamter Abschnitt "Session correlation header" gelöscht; neuer Top-Level-Abschnitt "Outbound correlation (SECURITY-RELEVANT)" mit Abhängigkeitshinweis zu `telemetry.enabled` und JSON-Konfigurationsbeispiel |
| `docs/design/telemetry-outbound-propagation-design.md`                              | Dieser Abschnitt + R4-Tabellenkopf + Überarbeitungsverweise                                                                                                                                                                                     |
| `packages/core/src/config/config.test.ts`                                           | **Neuer `describe`-Block `OutboundCorrelation Configuration`**, `it.each` mit 4 Fällen zur Sicherstellung der standardmäßigen `false`-Unveränderlichkeit von `getOutboundCorrelationPropagateTraceContext` (fehlend / `{}` / explizit `true` / explizit `false`) |

### 12.6 Antworten zu LaZzyMans Meta-Argumenten

| Argument                                                                       | Status nach R4                                                                                                                                    |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Telemetry-Namespace suggeriert eigenen Collector als Empfänger"               | ✅ Wire-Verhalten aus `telemetry.*` entfernt; neuer Namespace `outboundCorrelation.*` kennzeichnet explizit die Semantik "ausgehend zu Drittanbietern" |
| "Standardverhalten sollte ohne explizite Zustimmung keine Identifikatoren an Dritte senden" | ✅ `propagateTraceContext` standardmäßig `false`; das gesamte Session-ID-Folge-Paket wird ebenfalls standardmäßig deaktiviert sein                   |
| "Telemetry-PRs sollten kein Wire-Level-Verhalten einschmuggeln"                | ✅ Dieser PR fügt keinen Code-Pfad mehr hinzu, bei dem "Telemetrie das Wire-Verhalten steuert"; Wire-Verhalten wird einheitlich durch `outboundCorrelation.*` verwaltet |
| "Aufteilung ist mechanisch, Arbeit ist nicht verschwendet"                     | ✅ Der in R3 umgesetzte Code wird physikalisch aus diesem Branch gelöscht, bleibt aber in der Git-History für den Folge-PR zur Wiederverwendung (oder zum Cherry-Pick) |
### 12.7 follow-up PR Übersicht (informativ, nicht im Umfang dieses PRs)

Zukünftige follow-up PRs sollten Folgendes enthalten:

- `outboundCorrelation.sessionIdHeader: { enabled, trustedHosts }` oder eine ähnliche Einstellung
- Wiederverwendung der in R3 bereits implementierten Code-Skelette `wrapWithCorrelation` / `matchesTrustedHost` / `DEFAULT_SESSION_ID_HEADER_HOSTS`
- Ein Abschnitt zum Threat Model, in dem Folgendes klargestellt wird: Empfänger-Set, De-Anonymisierungsfenster für stabile IDs, optionales per-request UUID-Gegenstück
- **Standardmäßig deaktiviert** (keine Default-Allowlist – strenger als R3, entspricht LazzyMans Open-Source-CLI-Prinzipien)
- Sicherheitsrelevante Kennzeichnung + Aufnahme in `docs/users/configuration/settings.md`