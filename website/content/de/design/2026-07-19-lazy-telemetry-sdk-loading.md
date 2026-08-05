# Lazy-load the OpenTelemetry SDK off the ACP child startup path

- **Issue**: #4748 (Optimierung der Daemon-Cold-Start- und
  qwen-serve-Fast-Path-Latenz)
- **Status**: implementiert
- **Date**: 2026-07-19
- **Depends on**: #7182 (TUI-Modul-Entfernung), das Metafile-Audit unten

## Problem

`channel.initialize` (~1035 ms P50 auf 2C4G) ist der dominante Kostenfaktor
der kalten ersten Session des Daemons, und ~67 % davon ist Modulladen im
ACP-Kind. Ein Metafile-Audit des Post-#7182-Bundles (Commit `de962a5ecf`,
esbuild-Metafile mit `DEV=true`) zeigt, dass der eager statische Closure des
ACP-Kindes **17,24 MiB / 2420 Module** beträgt, wovon der
OpenTelemetry-Cluster der größte zusammenhängende Block ist:

| Gruppe                                                                 | Bytes (nach Tree-Shake) |
| ---------------------------------------------------------------------- | ----------------------- |
| `@grpc/grpc-js`                                                        | 577 KiB                 |
| `@opentelemetry/otlp-transformer`                                      | 479 KiB                 |
| `protobufjs` + `long` + `@grpc/proto-loader`                           | 305 KiB                 |
| `@opentelemetry/sdk-metrics` / `sdk-node` / `sdk-trace-*` / `sdk-logs` | ~260 KiB                |
| `@opentelemetry/instrumentation-*` + `instrumentation`                 | ~132 KiB                |
| verbleibende `@opentelemetry/*` (Exporters, Propagators, Resources, …) | ~250 KiB                |
| **Telemetrie-Cluster gesamt**                                          | **2,16 MiB**            |

Jedes Byte davon wird beim ACP-Kind-Start evaluiert, obwohl:

1. Telemetrie **standardmäßig deaktiviert** ist — der Normalfall zahlt die
   volle Modulsteuer für Code, den `initializeTelemetry()` dann ablehnt
   (`!config.getTelemetryEnabled()` Early-Return bei `sdk.ts:202`).
2. Selbst wenn aktiviert, benötigt nichts das SDK vor dem ersten
   Span/Log/Metric, der immer nach dem ACK von `initialize` liegt.

Zur Einordnung: #7182 entfernte 1,16 MiB und senkte die ACP-Importzeit von
115→52 ms (−63 ms). Dieser Cluster ist fast 2× so groß, daher ist ein Effekt
in derselben Größenordnung plausibel — vorbehaltlich des Mess-Gates des Issues
(unten).

## Warum die Import-Kette eager ist

`sdk.ts` importiert alles statisch auf Top-Level (`sdk.ts:13-32`): sechs
OTLP-Exporters (gRPC + HTTP × Traces/Logs/Metrics), `NodeSDK`,
Batch-Prozessoren, `PeriodicExportingMetricReader` und beide Instrumentations.
`sdk.ts` selbst wird über `telemetry/index.ts` statisch vom Core-Barrel
erreicht und kann nicht vollständig lazy gemacht werden, da zwei
Hot-Path-Module statisch von seinem billigen State-Getter abhängen:

- `telemetry/loggers.ts:80` → `isTelemetrySdkInitialized()` (gated jedes Log)
- `telemetry/session-tracing.ts:31` → dasselbe (gated jeden Span-Helfer)

Der Split muss daher die **billige State-Fassade** von der **schweren
SDK-Assembly** trennen und nicht nur sechs Exporter-Imports in
`await import()` verpacken — die
`NodeSDK`-/Instrumentation-/sdk-metrics-Imports (~0,7 MiB) sind ebenso
entfernbar und liegen in derselben Datei.

## Design

### Datei-Split innerhalb `packages/core/src/telemetry/`

**`sdk.ts` (bleibt; wird die Fassade — keine schweren Imports).** Behält,
unverändert in Name und Semantik, alles, was andere Module statisch erreichen:

- Modulzustand: `sdk`, `telemetryInitialized`, `telemetryShutdownPromise`,
  `activeMetricReader` (typisiert via `import type`, also kein Runtime-Laden)
- `isTelemetrySdkInitialized()`, `refreshSessionContext()`,
  `shutdownTelemetry()`, `forceFlushMetrics()`
- `resolveHttpOtlpUrl()` (exportiert, pur; keine schweren Abhängigkeiten)
- der `diag.setLogger(...)`-Seiteneffekt (benötigt nur `@opentelemetry/api`,
  das bereits allgegenwärtig und billig ist — 56 KiB, auch verwendet von
  `loggers.ts`/`metrics.ts`)

Sein einziger `@opentelemetry/*`-Runtime-Import ist `@opentelemetry/api`.

**`sdk-impl.ts` (neu; die schwere Hälfte).** Übernimmt unverändert: die sechs
OTLP-Exporter-Imports, `NodeSDK`, `BatchSpanProcessor`,
`BatchLogRecordProcessor`, `PeriodicExportingMetricReader`, beide
Instrumentations, `CompressionAlgorithm`, `resourceFromAttributes`,
`SessionIdSpanProcessor`, `parseOtlpEndpoint`, `validateUrl`,
`normalizeOtlpPrefix` + Prefix-Matching, das Propagator-Gate und den Body des
heutigen `initializeTelemetry()` ab dem Resource-Aufbau. Es exportiert eine
Funktion:

```ts
export function startTelemetrySdk(config: TelemetryRuntimeConfig):
  | {
      sdk: NodeSDK;
      metricReader: PeriodicExportingMetricReader | undefined;
    }
  | undefined;
```

und gibt auf dem bestehenden „gRPC ohne Basis-Endpoint"-Skip-Pfad `undefined`
zurück. `file-exporters.ts` und `log-to-span-processor.ts` ziehen ebenfalls
hinter `sdk-impl.ts` (sie werden heute nur von `sdk.ts` importiert und ziehen
`sdk-logs`/`sdk-metrics`/`sdk-trace-base`).

### `initializeTelemetry` wird async

In der Fassade:

```ts
let telemetryInitPromise: Promise<void> | undefined;

export function initializeTelemetry(
  config: TelemetryRuntimeConfig,
): Promise<void> {
  if (telemetryInitialized || !config.getTelemetryEnabled()) {
    return Promise.resolve();
  }
  telemetryInitPromise ??= (async () => {
    const { startTelemetrySdk } = await import('./sdk-impl.js');
    const started = startTelemetrySdk(config);
    if (!started) return;
    sdk = started.sdk;
    // sdk.start() + telemetryInitialized = true + setSessionContext +
    // setShellTracePropagation + initializeMetrics — same order as today,
    // same try/catch that only logs.
  })().finally(() => {
    telemetryInitPromise = undefined;
  });
  return telemetryInitPromise;
}
```

Wesentliche Eigenschaften:

- **Der deaktivierte Pfad bleibt synchron und kostenlos** — der
  `getTelemetryEnabled()`-Check läuft vor dem dynamischen Import, sodass User
  mit Standard-Konfiguration den 2,16-MiB-Cluster niemals laden. Das ist der
  eigentliche Gewinn für das ACP-Kind.
- Der Single-Flight-Guard (`telemetryInitPromise`) hält die Funktion
  idempotent unter konkurrierenden Aufrufern, entsprechend dem heutigen
  Recheck von `telemetryInitialized`.
- `shutdownTelemetry()` benötigt keine Änderungen: Es operiert auf der
  `sdk`-Variable der Fassade und ist bereits ein No-op, wenn
  `!telemetryInitialized`.

### Behandlung der Aufrufstellen (alle drei Produktionsaufrufer)

1. **`packages/core/src/config/config.ts:2192`** (Config-Konstruktor —
   synchroner Kontext; dies ist der Pfad, den das ACP-Kind nimmt, da
   `deferTelemetryInitialization` im ACP-Modus false ist, siehe
   `packages/cli/src/config/config.ts:2075`). Fire-and-forget mit geloggtem
   Catch:

   ```ts
   void initializeTelemetry(this).catch(...)
   ```

   Risikoanalyse: Die einzige Konsequenz eines späten Starts ist, dass in der
   Lücke emittierte Spans/Logs von den `isTelemetrySdkInitialized()`-Gates
   verworfen werden — was _bereits_ das Verhalten für das gesamte
   Pre-Konstruktor-Fenster und für den interaktiven TUI-Pfad ist, wo die
   Telemetrie-Initialisierung in einen Hintergrund-Task verschoben ist
   (`startup-prefetch.ts:259`). Kein neuer Fehlermodus.

   Verhaltensänderung (absichtlich, dokumentiert): Auf den nicht verschobenen
   Pfaden — dem ACP-Kind und Headless-`-p`-Runs, wo
   `deferTelemetryInitialization` false ist — war die Telemetrie zuvor
   vollständig registriert, sobald der synchrone `initializeTelemetry`-Aufruf
   zurückkehrte; sie settle nun asynchron, sodass sich das bestehende
   Verwurfsfenster um die Kosten des dynamischen Imports (~50–150 ms)
   erweitert. Hier wird absichtlich nicht `await`ed: Ein Await würde den
   2,16-MiB-Import wieder auf den kritischen Pfad des ACP-Kindes setzen und
   den Gewinn zunichte machen. Aufrufer, die garantierte Telemetrie-Bereitschaft
   vor dem Fortfahren benötigen (die Daemon-Runtime, Aufrufer 3), `await`en
   explizit.

2. **`packages/cli/src/startup/startup-prefetch.ts:261`**
   (Deferred-Task-Runner). Die Task-Closure ändern, um das Promise
   zurückzugeben (`() => initializeTelemetry(config)`), damit das bestehende
   Error-Handling von `runDeferredTask` Rejections beobachtet. Semantik
   ansonsten unverändert.

3. **`packages/cli/src/serve/run-qwen-serve.ts:2925`** (Daemon-Runtime).
   **Muss `await`en.** Die direkt folgende Zeile ruft
   `initializeDaemonMetrics()` auf, und OTels `metrics.getMeter()` cached ein
   Noop-Meter dauerhaft, wenn es aufgerufen wird, bevor das SDK den globalen
   MeterProvider registriert — Daemon-Metriken würden still sterben. Die
   umschließende Funktion ist bereits async, daher ist `await
core.initializeTelemetry(...)` eine Ein-Wort-Änderung. Dies fügt die Kosten
des Modulladens nur dann zum Laden der _Daemon-Runtime_ hinzu (verschoben,
abseits des Fast-Path), wenn Telemetrie aktiviert ist — akzeptabel und strikt
besser, als sie in jedem ACP-Kind zu zahlen.

   Dieselbe Reihenfolgen-Gefahr existiert prinzipiell für
   `initializeMetrics()` (`metrics.ts:409`), aber das wird _innerhalb_ des
   Init-Promises nach `sdk.start()` aufgerufen, sodass die Reihenfolge
   konstruktionsbedingt erhalten bleibt.

### Bundle-Guard-Erweiterung

Den ACP-Grenzen-Check von `scripts/check-serve-fast-path-bundle.js`
(`findAcpImportBoundaryOffenders`) mit einer Telemetrie-Blacklist erweitern,
damit der Split nicht still regressieren kann:

```
@grpc/grpc-js, @grpc/proto-loader, protobufjs,
@opentelemetry/otlp-transformer, @opentelemetry/sdk-node,
@opentelemetry/exporter-trace-otlp-grpc, @opentelemetry/exporter-logs-otlp-grpc,
@opentelemetry/exporter-metrics-otlp-grpc,
@opentelemetry/instrumentation-http, @opentelemetry/instrumentation-undici
```

(`@opentelemetry/api`, `semantic-conventions`, `core`, `resources`, `api-logs`
bleiben von der Blacklist ausgenommen — sie sind legitimerweise von
`loggers.ts`, `metrics.ts` und Type-Level-Exports erreichbar.)

## Was dies NICHT ändert

- Keine Verhaltensänderung bei aktivierter Telemetrie — dieselben Exporters,
  dieselben Prozessoren, dieselben Instrumentation-Hooks, dieselben
  Shutdown-/Flush-Semantiken.
- Keine Entfernung öffentlicher APIs: Der Rückgabetyp von
  `initializeTelemetry` ändert sich von `void → Promise<void>`, was
  quellkompatibel für bestehende Fire-and-forget-Aufrufer ist (alle
  Aufrufstellen werden ohnehin im selben Commit aktualisiert; dies ist eine
  Core-Package-Änderung, laut AGENTS.md von Maintainern erstellt).
- Die Barrel-Exporte von `telemetry/index.ts` behalten dieselben Namen.

## Akzeptanz (Mess-Gate von Issue #4748)

Byte-Zahlen lassen sich nicht in Millisekunden umrechnen; die Änderung muss
vor dem Merge die stehende Disziplin des Issues bestehen:

1. **2C4G, 30 serielle Kaltstarts**, Telemetrie deaktiviert
   (Standardkonfiguration): `channel.initialize` P50/P95 und
   Prozess→erste-Session P50 mit der `de962a5ecf`-Baseline vergleichen. Nur
   shippen, wenn P50 sich über das Run-to-Run-Rauschen hinaus verbessert.
2. **Funktionsdurchlauf mit aktivierter Telemetrie**: OTLP-gRPC- und
   HTTP-Ziele erhalten nach der Änderung jeweils Traces/Logs/Metriken
   (bestehende `sdk.test.ts`-Matrix plus ein manueller Ende-zu-Ende-Lauf gegen
   einen lokalen Collector); `--telemetry-outfile`-Datei-Exporters schreiben
   weiterhin.
3. **Daemon-Metriken**: Bei aktivierter Telemetrie klingeln
   Daemon-Status-Metriken weiterhin und `initializeDaemonMetrics()`-Gauges
   melden weiterhin (bewacht das Await an Aufrufstelle 3).
4. **Bundle-Guard**: `node scripts/check-serve-fast-path-bundle.js` grün mit
   der erweiterten Blacklist; das Closure-Audit erneut ausführen
   (`.qwen/scripts/acp-closure-audit.mjs`) und die neue ACP-Closure-Summe
   aufzeichnen (erwartet ≈ 17,24 − ~2,0 MiB, abzüglich dessen, was
   `@opentelemetry/api` und Freunde eager halten).
5. **Unit-Tests**: `sdk.test.ts` awaitet `initializeTelemetry` (15
   Aufrufstellen); Tests, die Exporter-Konstruktion asserten, ziehen nach
   `sdk-impl.ts` um oder mocken es.

## Berücksichtigte Alternativen

- **Nur die sechs Exporter-Klassen lazy importieren, `initializeTelemetry`
  synchron halten.** Abgelehnt: Lässt ~0,7 MiB (`NodeSDK`, Instrumentations,
  `sdk-metrics`, Batch-Prozessoren) grundlos eager und erzwingt trotzdem
  irgendwo eine async Grenze — der aktivierte Pfad konstruiert Exporters
  bedingungslos, sodass die Funktion so oder so async wird.
- **Das gesamte `telemetry/sdk.ts`-Modul dynamisch machen.** Abgelehnt:
  `loggers.ts` und `session-tracing.ts` gaten jeden Telemetrie-Aufruf mit
  `isTelemetrySdkInitialized()`; dieses Gate async zu machen würde Dutzende
  heiße synchrone Aufrufstellen vergiften.
- **Telemetrie im ACP-Kind ganz überspringen.** Bereits im Issue abgelehnt
  (pauschale Skips ändern das beobachtbare Verhalten für User, die Telemetrie
  aktivieren).
