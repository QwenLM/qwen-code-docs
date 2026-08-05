# Telemetry exporter protocol split (lazy SDK phase 2)

- Status: implementiert
- Issue: QwenLM/qwen-code#7264 (Kandidat 1), Follow-up zu #4748
- Vorgänger: `2026-07-19-lazy-telemetry-sdk-loading.md` (Fassaden-/Impl-Split)

## Problem

Phase 1 verschob das gesamte Telemetrie-SDK hinter einen dynamischen
`import()`, sodass Telemetrie-aus-Prozesse nichts laden. Aber
Telemetrie-**an**-Prozesse laden weiterhin den vollständigen statischen
Closure von `sdk-impl.ts`, der beide OTLP-Protokollketten bündelt, unabhängig
davon, welche die Konfiguration wählt:

| Cluster                                                                                                              | Größe (Metafile, de962a5ecf + Phase 1) | Benötigt von                         |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------ |
| gRPC-Kette (`@grpc/grpc-js`, `protobufjs`, `@grpc/proto-loader`, `exporter-*-otlp-grpc`, `long`, `lodash.camelcase`) | 1121 KiB / 125 Module                  | nur `otlpProtocol: 'grpc'`           |
| HTTP-Kette (`exporter-*-otlp-http`)                                                                                  | 23 KiB / 17 Module                     | nur `otlpProtocol: 'http'`           |
| Geteilte OTLP-Schicht (`otlp-transformer`, `otlp-exporter-base`)                                                     | 915 KiB / 41 Module                    | beide OTLP-Protokolle, **nicht** outfile |

Das Metafile zeigt zwei statische Importeure der OTLP-Fläche außerhalb der
Exporter-Pakete selbst:

1. `sdk-impl.ts` (sein `CompressionAlgorithm`-Import) — entfernt, indem die
   Exporter-Konstruktion in die Protokollmodule verlagert wird.
2. `@opentelemetry/sdk-node` selbst — dessen `utils.js`/`sdk.js` require()t
   eagerly jedes Exporter-Paket (otlp proto/http/grpc × 3 Signale, zipkin,
   prometheus), um die `OTEL_*_EXPORTER`-umgebungsbasierte Autokonfiguration
   zu unterstützen. qwen-code erreicht diese Codepfade nie: Es übergibt immer
   explizite `spanProcessors` / `logRecordProcessors` (ein leeres Array
   short-circuited den Env-Fallback weiterhin). Gehandhabt durch einen
   Bundle-Zeit-Stub, siehe unten.

Wenn beides abgeschnitten ist, entfernt der Split die gesamte OTLP-Fläche vom
Outfile-Pfad, die gRPC-Kette vom HTTP-Pfad und die HTTP-Kette vom gRPC-Pfad.

Der 2C4G-Benchmark von Phase 1 zeigte, warum das wichtig ist: Bei aktivierter
Telemetrie (outfile) konkurriert das dynamische Laden von sdk-impl auf 2
Kernen mit dem Session-Setup um CPU (`config_construction`/`bootstrap`
+50 ms) und frisst den Großteil des −50-ms-Importketten-Gewinns auf. Zu
verkleinern, was tatsächlich lädt, verkleinert diese Konkurrenz.

## Design

Zwei neue Module besitzen die Exporter-Konstruktion und werden via dynamischem
`import()` von `startTelemetrySdk` nur auf ihrem jeweiligen
Konfigurationsbranch geladen:

- `packages/core/src/telemetry/sdk-exporters-grpc.ts`
  - Importiert die drei gRPC-Exporters + `CompressionAlgorithm` +
    `PeriodicExportingMetricReader`.
  - `createGrpcExporters(endpoint)` → `{ spanExporter, logExporter, metricReader }`,
    alle gzip-komprimiert, exakt der aktuellen Konstruktion entsprechend.
- `packages/core/src/telemetry/sdk-exporters-http.ts`
  - Importiert die drei HTTP-Exporters + `PeriodicExportingMetricReader` +
    `LogToSpanProcessor`.
  - `createHttpExporters({ tracesUrl, logsUrl, metricsUrl, logToSpan })` →
    `{ spanExporter?, logExporter?, metricReader?, logToSpanProcessor? }`.
    Die Logs→Spans-Bridge-Entscheidung (Logs-Endpoint fehlt, Traces
    vorhanden) zieht mit hierher, da die Bridge einen HTTP-Trace-Exporter
    konstruiert.

Änderungen an `sdk-impl.ts`:

- Entfernt alle sechs Exporter-Imports und `CompressionAlgorithm`;
  Exporter-Variablen werden gegen die SDK-Interfaces typisiert
  (`SpanExporter`, `LogRecordExporter`), von denen es bereits abhängt.
- `startTelemetrySdk` wird `async`. Die Branch-Reihenfolge bleibt erhalten:
  - gRPC ohne Basis-Endpoint liefert weiterhin `undefined` zurück, **bevor**
    ein Protokollmodul lädt.
  - Die HTTP-URL-Validierung (`validateUrl`) bleibt in `sdk-impl.ts`; das
    HTTP-Modul wird nur importiert, wenn mindestens eine Signal-URL die
    Validierung übersteht.
  - Der Outfile-Branch berührt keines der Protokollmodule.
- Die Fassade awaitet `startTelemetrySdk` (sie läuft bereits innerhalb der
  Single-Flight-async-Closure, also keine aufrufersichtbare Änderung).

`esbuild.config.js` erhält `sdkNodeExporterStubPlugin`: Wenn — und nur wenn —
der Importeur `@opentelemetry/sdk-node` ist, lösen sich die Exporter-Pakete zu
einem Stub auf, dessen Konstruktoren werfen. Unsere Protokollmodule lösen
weiterhin die echten Pakete auf. sdk-node berührt diese Bindings nur innerhalb
seiner env-gesteuerten Konfigurationsfunktionen, die qwen-codes explizite
Prozessor-Argumente für Traces und Logs unerreichbar machen; der eine
erreichbare Pfad (`OTEL_METRICS_EXPORTER=otlp` usw.) wirft nun innerhalb von
`NodeSDK.start()` — gefangen vom bestehenden Try/Catch der Fassade — statt
still zu einem Default-Localhost-Endpoint zu exportieren. Env-basierte
Exporter-Auswahl war nie eine unterstützte qwen-code-Konfigurationsfläche.

Was jede Konfiguration nach dem Split lädt (gemessener statischer Closure
jedes gebündelten Entry-Chunks):

| Konfiguration | Lädt                                              | Überspringt          |
| ------------- | ------------------------------------------------- | -------------------- |
| outfile       | nur sdk-impl-Closure (975 KiB)                    | beide Protokollketten |
| OTLP http     | + HTTP-Ketten-Closure (1,2 MiB inkl. geteilter Schicht) | gRPC-Cluster    |
| OTLP grpc     | + gRPC-Ketten-Closure (1,9 MiB inkl. geteilter Schicht) | HTTP-Exporters  |

## Guard

`scripts/check-serve-fast-path-bundle.js` erhält einen Check, der am
`sdk-impl`-Chunk verwurzelt ist: Sein statischer Import-Closure darf kein
Mitglied von `FORBIDDEN_OTLP_PROTOCOL_PACKAGES` erreichen — der gRPC-Cluster
(`@grpc/grpc-js`, `@grpc/proto-loader`, `protobufjs`,
`exporter-*-otlp-grpc`) plus `@opentelemetry/otlp-transformer`, das in der
geteilten Serialisierungsschicht liegt, die beide Protokollketten hereinziehen,
und daher auch einen statischen Re-Import des HTTP-Moduls fängt. Dies sperrt
den Protokoll-Split auf dieselbe Weise, wie die Phase-1-Blacklist den
Fassaden-Split sperrt.

## Tests

- `sdk.test.ts` behält sein `vi.mock`-Setup unverändert: Die vitest-Interception
  gilt für die Imports derselben Exporter-Pakete durch die Protokollmodule,
  sodass bestehende Konstruktor-Argument-Assertions übernommen werden.
- Die Akzeptanz folgt der #4748-Disziplin: 30 gepaarte serielle Kaltstarts auf
  dem 2C4G-Host, Telemetrie an (outfile), Kontrolle = Phase-1-Build, Kandidat
  = diese Änderung, Berichterstattung von channel.initialize und
  Prozess→erste-Session P50/P95.

## Abgelehnte Alternativen

- **Pro-Exporter-Module (pro Signal)**: Drei weitere Module ohne messbaren
  Gewinn — die drei Signale eines Protokolls werden immer gemeinsam
  konfiguriert.
- **URL-Validierung in das HTTP-Modul verlagern**: Würde `diag`-Warnungen für
  ungültige URLs hinter ein Modulladen verschieben und den
  Keine-gültige-URL-Pfad von „überhaupt kein Import" zu „Import, dann No-op"
  ändern.
