# Observability mit OpenTelemetry

Erfahre, wie du OpenTelemetry für Qwen Code aktivierst und einrichtest.

- [Observability mit OpenTelemetry](#observability-with-opentelemetry)
  - [Wichtige Vorteile](#key-benefits)
  - [OpenTelemetry-Integration](#opentelemetry-integration)
  - [Konfiguration](#configuration)
  - [Aliyun Telemetry](#aliyun-telemetry)
    - [Manueller OTLP-Export](#manual-otlp-export)
  - [Lokale Telemetry](#local-telemetry)
    - [Dateibasierte Ausgabe (Empfohlen)](#file-based-output-recommended)
    - [Collector-basierter Export (Erweitert)](#collector-based-export-advanced)
  - [Logs und Metriken](#logs-and-metrics)
    - [Logs](#logs)
    - [Metriken](#metrics)
    - [Daemon-Metriken](#daemon-metrics)
    - [Spans](#spans)
    - [Ressourcenmetriken](#resource-metrics)
    - [Performance Monitoring (Reserviert)](#performance-monitoring-reserved)

## Migrationshinweise

- `tool_output_truncated` wurde aus Gründen der Namespace-Konsistenz in `qwen-code.tool_output_truncated` umbenannt – Downstream-Consumer, die nach dem alten Namen filtern, sollten ihre Queries aktualisieren.

- Die Dokumentation für das `tool.call.latency`-Histogramm listete zuvor ein `decision`-Attribut auf – dieses wurde nie auf dem Histogramm gesetzt (nur `function_name` wird aufgezeichnet). Der `tool.call.count`-Counter enthält weiterhin `decision`.

- Das `qwen-code.file_operation`-Log-Event und die `file.operation.count`-Metrik-Dokumentation listeten zuvor Diff-Stat-Attribute (`model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`) auf – diese wurden bei beiden nie gesetzt. Diff-Stat-Daten sind über das `metadata`-Attribut des `tool_call`-Log-Events verfügbar.

## Wichtige Vorteile

- **🔍 Nutzungsanalysen**: Verstehe Interaktionsmuster und die Akzeptanz von Features in deinem Team
- **⚡ Performance Monitoring**: Überwache Antwortzeiten, Token-Verbrauch und Ressourcennutzung
- **🐛 Echtzeit-Debugging**: Identifiziere Engpässe, Ausfälle und Fehlermuster, während sie auftreten
- **📊 Workflow-Optimierung**: Triff fundierte Entscheidungen zur Verbesserung von Konfigurationen und Prozessen
- **🏢 Enterprise Governance**: Überwache die Nutzung teamübergreifend, verfolge Kosten, stelle Compliance sicher und integriere dich in bestehende Monitoring-Infrastrukturen

## OpenTelemetry-Integration

Aufbauend auf **[OpenTelemetry]** – dem herstellerneutralen, branchenweiten Observability-Framework – bietet das Observability-System von Qwen Code:

- **Universelle Kompatibilität**: Export zu jedem OpenTelemetry-Backend (Aliyun, Jaeger, Prometheus, Datadog, etc.)
- **Standardisierte Daten**: Verwende konsistente Formate und Erfassungsmethoden in deiner Toolchain
- **Zukunftssichere Integration**: Verbinde dich mit bestehender und zukünftiger Observability-Infrastruktur
- **Kein Vendor Lock-in**: Wechsle zwischen Backends, ohne deine Instrumentierung zu ändern

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Konfiguration

Das gesamte Telemetrie-Verhalten wird über deine `.qwen/settings.json`-Datei gesteuert. Diese Einstellungen können durch Umgebungsvariablen oder CLI-Flags überschrieben werden.

| Einstellung                           | Umgebungsvariable                                 | CLI-Flag                                                 | Beschreibung                                                                                                                                    | Werte            | Standard                 |
| --------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                         | `QWEN_TELEMETRY_ENABLED`                             | `--telemetry` / `--no-telemetry`                         | Telemetrie aktivieren oder deaktivieren                                                                                                                    | `true`/`false`    | `false`                 |
| `target`                          | `QWEN_TELEMETRY_TARGET`                              | `--telemetry-target <local\|gcp>` _(deprecated)_         | Informatives Ziel-Label; steuert nicht das Export-Routing – setze `otlpEndpoint` oder `outfile`, um zu konfigurieren, wohin Daten gesendet werden           | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                    | `QWEN_TELEMETRY_OTLP_ENDPOINT`                       | `--telemetry-otlp-endpoint <URL>`                        | OTLP-Collector-Endpunkt                                                                                                                        | URL-String        | `http://localhost:4317` |
| `otlpProtocol`                    | `QWEN_TELEMETRY_OTLP_PROTOCOL`                       | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP-Transportprotokoll                                                                                                                        | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`              | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                | -                                                        | Signal-spezifischer Endpunkt-Override für Traces (nur HTTP)                                                                                            | URL-String        | -                       |
| `otlpLogsEndpoint`                | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                  | -                                                        | Signal-spezifischer Endpunkt-Override für Logs (nur HTTP)                                                                                              | URL-String        | -                       |
| `otlpMetricsEndpoint`             | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`               | -                                                        | Signal-spezifischer Endpunkt-Override für Metriken (nur HTTP)                                                                                           | URL-String        | -                       |
| `outfile`                         | `QWEN_TELEMETRY_OUTFILE`                             | `--telemetry-outfile <path>`                             | Telemetrie in Datei speichern (überschreibt OTLP-Export)                                                                                                 | Dateipfad         | -                       |
| `logPrompts`                      | `QWEN_TELEMETRY_LOG_PROMPTS`                         | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Prompts in Telemetrie-Logs einschließen                                                                                                              | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`  | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`   | -                                                        | Benutzer-Prompts, System-Prompts, Tool-I/O und Modell-Output als native Span-Attribute einschließen (zusätzlich zu Log-to-Span-Bridge-Spans)           | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength` | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` | -                                                        | Maximale JavaScript-String-Länge für jeden sensiblen nativen Span-Attribut-Inhaltspayload. Setze diesen Wert niedriger, wenn dein Backend große Attribute ablehnt. | `1..104857600`    | `1048576`               |
| `resourceAttributes`              | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)   | -                                                        | Statische Ressourcen-Attribute, die jedem exportierten Span / Log / jeder Metrik angehängt werden. Siehe [Ressourcen-Attribute](#resource-attributes) unten.              | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`        | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`          | -                                                        | `session.id` auf Metrik-Datenpunkten einschließen. **Standardmäßig deaktiviert**, um Metrik-Backends vor Time-Series-Fan-out zu schützen.                       | `true`/`false`    | `false`                 |

**Hinweis zu booleschen Umgebungsvariablen:** Für die booleschen Einstellungen (`enabled`, `logPrompts`, `includeSensitiveSpanAttributes`) wird das Feature aktiviert, wenn die entsprechende Umgebungsvariable auf `true` oder `1` gesetzt wird. Jeder andere Wert deaktiviert es.

**Hinweis zu Integer-Umgebungsvariablen:** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` muss beim Setzen eine positive Ganzzahl sein. Ungültige Werte führen dazu, dass die Auflösung der Telemetrie-Konfiguration fehlschlägt, anstatt stillschweigend auf einen Fallback zurückzugreifen.

**Sensitive Span-Attribute:** Wenn `includeSensitiveSpanAttributes` aktiviert ist, passieren zwei Dinge:

1. **Native Span-Attribute (`qwen-code.interaction`, `api.generateContent*`, `tool.<name>`)** tragen den unveränderten Konversationsinhalt:
   - Benutzer-Prompts (`new_context`)
   - System-Prompts (`system_prompt` – vollständiger Text einmal pro Session, dedupliziert per SHA-256-Hash; nachfolgende Spans tragen nur `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`)
   - Tool-Schemas (werden als `tool_schema`-Events emittiert, ebenfalls Hash-dedupliziert)
   - Tool-Inputs (`tool_input`) und Tool-Results (`tool_result`)
   - Modell-Output (`response.model_output`)

   Jede Inhaltspayload wird bei `sensitiveSpanAttributeMaxLength` JavaScript-String-Einheiten abgeschnitten. Der Standard ist 1 MiB (`1048576`), erhöht vom vorherigen Standard von 60 KiB; setze `61440`, um das alte Limit beizubehalten. Das Limit muss zwischen `1` und `104857600` (100 MiB) liegen. Bei beschrifteten Attributen zählen feste Labels wie `[USER PROMPT]`, `[TOOL INPUT: ...]` und `[TOOL RESULT: ...]` auf das Limit an; der Truncation-Marker zählt ebenfalls dazu. Das Limit wird als JavaScript-String-Länge und nicht als UTF-8-Bytes gemessen. Nicht-ASCII-Inhalte können daher nach dem OTLP-Export mehr Bytes belegen. Bei den meisten Payload-Typen fügt die Trunkierung sowohl `*_truncated` als auch `*_original_length` hinzu. System-Prompts setzen bei Trunkierung auch `system_prompt_truncated`, verwenden aber das immer vorhandene `system_prompt_length` für die ursprüngliche Länge.

2. **Log-to-Span-Bridge-Spans** (werden verwendet, wenn HTTP-Traces ohne Log-Endpunkt exportiert werden) behalten ihre bestehenden `prompt`-, `function_args`- und `response_text`-Felder, anstatt verworfen zu werden.

⚠️ **Sicherheitswarnung:** Das Aktivieren dieses Flags streamt den vollständigen Konversationsverlauf, von `read_file` gelesene Dateiinhalte, Shell-Befehle und deren Output (einschließlich Secrets in Umgebungsvariablen oder Argumenten) sowie Modell-Antworten an das konfigurierte OTLP-Backend. Behandle das Backend als privilegierte Datensenke. Das Flag ist standardmäßig auf `false` gesetzt.

**Kosten / Payload-Größe:** Ein starker Turn mit dem Standardlimit (1 MiB System-Prompt plus 10 Tool-Calls, jeder bis zu 1 MiB Input + 1 MiB Result, plus 1 MiB Modell-Output) kann vor der OTLP-Komprimierung bis zu ~22 MiB an Attribut-Payload erzeugen, plus bis zu 1 MiB pro emittiertem Tool-Schema in Workspaces mit großen Tool-Definitionen. Dies ist das anwendungsseitige Limit von Qwen Code, keine Garantie dafür, dass jeder Collector oder Backend ein so großes einzelnes Attribut akzeptiert. Wenn Spans abgelehnt oder verworfen werden, senke `sensitiveSpanAttributeMaxLength` (z. B. auf `61440`) und überwache den Export-Durchsatz.

Diese Einstellung deaktiviert keine sensiblen Daten in OTel-Logs oder anderen Telemetrie-Senken; Telemetrie für nicht-interne API-Antworten kann `response_text` füllen, sodass OTel-Logs, UI-Telemetrie und Chat-Aufzeichnungen unabhängig von dieser Einstellung Antworttext erhalten können. QwenLogger enthält kein `response_text`.

**HTTP-OTLP-Signal-Routing:** Bei Verwendung des HTTP-Protokolls (`otlpProtocol: "http"`) hängt Qwen Code automatisch signal-spezifische Pfade (`/v1/traces`, `/v1/logs`, `/v1/metrics`) an den Basis-`otlpEndpoint` an. Zum Beispiel wird `http://collector:4318` für Traces zu `http://collector:4318/v1/traces`. Wenn die URL bereits mit einem Signal-Pfad endet, wird sie unverändert verwendet. Signal-spezifische Endpunkt-Overrides (`otlpTracesEndpoint`, etc.) haben Vorrang vor dem Basis-Endpunkt und werden unverändert verwendet. Das gRPC-Protokoll verwendet service-basiertes Routing und hängt keine Pfade an.

Die signal-spezifischen Endpunkt-Umgebungsvariablen akzeptieren auch die Standard-OpenTelemetry-Namen: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. Die `QWEN_TELEMETRY_OTLP_*`-Varianten haben Vorrang vor den `OTEL_*`-Varianten.

Ausführliche Informationen zu allen Konfigurationsoptionen findest du im [Konfigurationsleitfaden](../../users/configuration/settings.md).

### Ressourcen-Attribute

Ressourcen-Attribute sind statische Key-Value-Paare, die jedem über OTLP exportierten Span, Log und jeder Metrik angehängt werden. Verwende sie, um Telemetrie nach Team, Umgebung, Deploy-Region oder jeder anderen Dimension zu filtern, die dein Backend benötigt.

Zwei Quellen, zusammengeführt in Prioritätsreihenfolge (niedrigste → höchste):

1. Die Standard-Umgebungsvariable `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` in `.qwen/settings.json` (überschreibt die Umgebungsvariable bei Key-Konflikten)

`OTEL_SERVICE_NAME` ist ein separater Escape-Hatch – wenn gesetzt, überschreibt es `service.name` aus jeder anderen Quelle (gemäß der OpenTelemetry-Spezifikation).

#### Beispiele

**Alle Telemetrie nach Team / Umgebung filtern:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Routing zu einem mandantenfähigen Collector via `service.name`:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Fleet-Baseline (`~/.qwen/settings.json`) + Host-spezifischer Override:**

```json
{
  "telemetry": {
    "resourceAttributes": {
      "deployment.environment": "production",
      "service.namespace": "engineering-tooling"
    }
  }
}
```

```bash
# Füge einen einmaligen Tag hinzu, ohne die Einstellungen zu ändern:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Reservierte Keys

Einige Keys werden zur Laufzeit gesteuert und können nicht überschrieben werden:

- `service.version` – wird immer auf die laufende CLI-Version gesetzt. Das Setzen aus einer beliebigen Quelle wird stillschweigend mit einer Warnung verworfen.
- `session.id` – wird zur Laufzeit pro Session injiziert. Vom Benutzer bereitgestellte Werte aus der Umgebungsvariable oder den Einstellungen werden mit einer Warnung verworfen. Der Grund ist, dass Ressourcen-Attribute automatisch an jeden Metrik-Datenpunkt angehängt werden; das Zulassen von Benutzer-Overrides würde die [Kardinalitätskontrollen](#cardinality-controls) unten umgehen. Spans und Logs tragen immer `session.id`.

`service.name` ist **nicht** reserviert; es folgt der obigen Prioritätskette.

#### Format

`OTEL_RESOURCE_ATTRIBUTES` folgt der OpenTelemetry-Spezifikation: `key1=value1,key2=value2`, wobei Werte percent-encoded sind. Leerzeichen in Werten müssen als `%20` kodiert werden, **Kommas als `%2C`** (unkodierte Kommas teilen den Wert an der falschen Stelle und die zweite Hälfte wird als fehlerhaft verworfen). Fehlerhafte Paare werden mit einer Warnung übersprungen, anstatt den Telemetrie-Start fehlschlagen zu lassen.

#### Troubleshooting: Wenn ein vom Benutzer bereitgestelltes Attribut nicht wirksam zu sein scheint

Reservierte Keys (`service.version`, `session.id`), fehlerhafte Paare, nicht-string Einstellungen und ungültiges Percent-Encoding werden alle stillschweigend verworfen, wobei eine Warnung über den OpenTelemetry-Diagnosekanal geloggt wird. Dieser Kanal leitet an die Debug-Log-Datei (`~/.qwen/log/otel-*.log`) weiter, **nicht** an die Konsole, sodass das Verhalten wie ein stiller Fehler aussehen kann.

Wenn ein benutzerdefiniertes Ressourcen-Attribut nicht in der exportierten Telemetrie erscheint:

1. Prüfe `~/.qwen/log/otel-*.log` auf Zeilen, die `cannot override` (reservierter Key verworfen), `Skipping malformed` (fehlerhaftes Umgebungsvariablen-Paar) oder `must be a string` (nicht-string Einstellungswert) enthalten.
2. Stelle sicher, dass die Umgebungsvariable in der Umgebung des qwen-code-Prozesses gesetzt ist (nicht nur in deiner Shell) und dass die Werte percent-encoded sind.
3. Bestätige, dass `telemetry.enabled` auf `true` gesetzt ist – die Telemetrie-Initialisierung läuft nur, wenn sie aktiviert ist.

### Kardinalitätskontrollen

Metriken werden im Backend nach Attribut-Menge aggregiert – jede unterschiedliche Kombination von Attributwerten erzeugt eine neue Time-Series. Das Anhängen eines hochkardinalen Feldes wie `session.id` an eine Metrik verursacht einen Time-Series-Fan-out proportional zur Anzahl der Sessions, was den Speicher des Metrik-Backends schnell erschöpft.

Um dies zu verhindern, hält Qwen Code hochkardinale Attribute standardmäßig von Metrik-Datenpunkten fern. Spans und Logs sind ereignisbasiert und nicht betroffen, sodass sie weiterhin `session.id` für die Trace- und Log-Korrelation tragen.

#### `telemetry.metrics.includeSessionId` (Standard: `false`)

Das Setzen auf `true` (über Einstellungen oder `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) hängt `session.id` wieder an jeden Metrik-Datenpunkt an.

⚠️ **Warnung:** Jede CLI-Session erzeugt einen neuen Wert. Das Aktivieren dieser Option für eine Fleet wird den Metrik-Speicher sprengen. Wird nur für kurzfristiges Debugging empfohlen. Für die langfristige Session-Korrelation solltest du stattdessen Trace- oder Log-Backends abfragen.

#### Migration von früheren Versionen

Vor diesem Release wurde `session.id` standardmäßig an Metriken angehängt. Wenn deine Prometheus-Queries / Grafana-Dashboards / Alert-Regeln `session_id` auf einer Metrik referenzieren, hast du zwei Optionen:

**Option A** – das bisherige Verhalten für kurzfristiges Debugging wiederherstellen:

```bash
export QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true
```

oder:

```json
{
  "telemetry": {
    "metrics": { "includeSessionId": true }
  }
}
```

**Option B (empfohlen)** – Session-Level-Analyse von Metriken weg verschieben. Spans und Logs tragen weiterhin `session.id`, und Trace- / Log-Backends (Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) verarbeiten das Filtern pro Session nativ ohne Kardinalitätsdruck.

### Client-seitiger HTTP-Span bei ausgehendem Fetch

Wenn Telemetrie aktiviert ist, registriert Qwen Code `UndiciInstrumentation`, die für jede vom Prozess ausgehende `fetch()`-Anfrage einen client-seitigen HTTP-Span erzeugt – einschließlich der LLM-SDKs (`openai`, `@google/genai`, `@anthropic-ai/sdk`), dem MCP StreamableHTTP-Client, dem `WebFetch`-Tool und allen Out-of-Process-Aufrufen von IDE-Erweiterungen. Der Span ermöglicht es dir, die Netzwerklatenz (TTFB / Response-Body-Transfer) getrennt von der vorgelagerten Modellverarbeitungszeit zu sehen, was der bestehende `api.generateContent`-Span allein nicht unterscheiden kann.

Diese Spans gehen an deinen **eigenen** OTLP-Collector (oder die Datei-Ausgabedatei), genau wie der Rest der Telemetrie – sie beeinflussen nicht, was in die ausgehende HTTP-Anfrage selbst geschrieben wird. Ob der W3C `traceparent`-Header ebenfalls in den ausgehenden Request-Stream geschrieben wird, wird durch eine **separate, sicherheitsrelevante Einstellung** gesteuert, die unten unter [Outbound-Korrelation (sicherheitsrelevant)](#outbound-correlation-security-relevant) dokumentiert ist.

**Vermeidung von Feedback-Schleifen.** Das OTel-SDK verwendet intern `fetch`, um OTLP-Daten hochzuladen. Ohne Schutz würde die Instrumentierung von `fetch` diese Uploads tracen, die dann selbst hochgeladen würden, was eine Endlosschleife verursacht. Die Undici-Instrumentierung von Qwen Code ist mit einem `ignoreRequestHook` konfiguriert, der URLs überspringt, die den konfigurierten Präfixen `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint` entsprechen. Im Datei-Ausgabemodus gibt es keine ausgehenden HTTP-Uploads, daher ist der Hook ein No-Op.

## Outbound-Korrelation (SICHERHEITSRELEVANT)

Diese Einstellungen leben absichtlich in einem **separaten Top-Level-Namespace** von `telemetry.*`: Telemetrie steuert den Datenfluss in das eigene Observability-Backend des Operators, während `outboundCorrelation.*` steuert, welche client-seitigen Korrelationsdaten qwen-code **in ausgehende LLM-API-Request-Streams** schreibt, die Endpunkte von Drittanbieter-LLM-Providern (DashScope, OpenAI, Anthropic, etc.) erreichen. Unterschiedliche Empfänger, unterschiedliche Consent-Entscheidung. **Alle Werte sind standardmäßig ausgeschaltet.** Siehe die PR #4390 Review-Diskussion für die Begründung.
### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // default
}
```

Wenn `false` (Standard), installiert Qwen Code einen No-Op-`TextMapPropagator` im OTel SDK. Die UndiciInstrumentation erstellt weiterhin Client-HTTP-Spans für deinen OTLP-Collector, aber `propagation.inject()` ist ein No-Op, sodass **kein `traceparent` in ausgehende Requests geschrieben wird**. Trace-IDs bleiben intern im Collector des Betreibers.

Wenn `true`, wird der Standard-W3C-Composite-Propagator (`tracecontext` + `baggage`) des SDK installiert und der Standard-`traceparent`-Header wird bei jedem ausgehenden `fetch` geschrieben:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Zusätzlich werden die Umgebungsvariablen `TRACEPARENT` und `TRACESTATE` in Shell-Child-Prozessen (Bash-Tool, Hooks, Monitor) gesetzt, damit gestartete Befehle am selben Distributed Trace teilnehmen können.

Aktiviere dies nur, wenn der LLM-Provider ebenfalls in deinen OTel-Collector reportet, um process-übergreifende Traces zu verknüpfen – z. B. ARMS Tracing für DashScope. Für die meisten Betreiber ist der Wert `false`; herstellerübergreifende Trace-Fortsetzung ist ein Nischenfall.

**Hängt ab von `telemetry.enabled: true`.** Das OTel SDK wird nur initialisiert, wenn Telemetrie aktiviert ist, daher zeigt `propagateTraceContext` nur in diesem Zustand Wirkung. Das Setzen auf `true` bei deaktivierter Telemetrie ist ein stiller No-Op – kein SDK, kein Propagator, kein `traceparent` auf der Leitung. Überprüfe beide Flags beim Einrichten einer ARMS+DashScope-Korrelation:

```jsonc
{
  "telemetry": {
    "enabled": true,
    "otlpTracesEndpoint": "http://tracing-analysis-...",
  },
  "outboundCorrelation": {
    "propagateTraceContext": true,
  },
}
```

### Weitere Outbound-Korrelations-Header

`X-Qwen-Code-Session-Id` und `X-Qwen-Code-Request-Id` sind **nicht Teil dieses PRs**. Sie werden in eigenen Follow-up-PRs unter demselben `outboundCorrelation.*`-Namespace entworfen und vorgeschlagen, jeweils mit eigenem Threat Model und Operator-Consent-Flow. Das Review zu PR #4390 (LaZzyMan) hat das Prinzip etabliert: "Der Arbeitsumfang der Telemetrie umfasst nicht das Senden von Identifikatoren an LLM-Provider"; die Arbeit an Korrelations-Headern wird in eine eigene Design-Diskussion verschoben, anstatt unter Telemetrie zu landen.

## Aliyun Telemetry

### Manueller OTLP-Export

Um die Qwen Code-Telemetrie im Alibaba Cloud Managed Service for OpenTelemetry anzuzeigen, konfiguriere Qwen Code so, dass es an den von ARMS bereitgestellten OTLP-Endpunkt exportiert.

Das alleinige Setzen von `"target": "gcp"` konfiguriert nicht das Exportziel. Wenn `otlpEndpoint` nicht gesetzt ist, verwendet Qwen Code weiterhin den Standardwert `http://localhost:4317`. Wenn `outfile` gesetzt ist, überschreibt es `otlpEndpoint` und die Telemetrie wird in die Datei geschrieben, anstatt an Alibaba Cloud gesendet zu werden.

1. Aktiviere die Telemetrie in deiner `.qwen/settings.json` und setze den OTLP-Endpunkt:

   **Option A: gRPC-Protokoll** (Standard-OTLP-Endpunkt):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "otlpEndpoint": "https://<your-otlp-endpoint>",
       "otlpProtocol": "grpc"
     }
   }
   ```

   **Option B: HTTP-Protokoll mit signal-spezifischen Endpunkten** (für Backends, die Nicht-Standard-Pfade verwenden, z. B. `/api/otlp/traces` statt `/v1/traces`):

   ```json
   {
     "telemetry": {
       "enabled": true,
       "otlpProtocol": "http",
       "otlpTracesEndpoint": "http://<host>/<token>/api/otlp/traces",
       "otlpLogsEndpoint": "http://<host>/<token>/api/otlp/logs",
       "otlpMetricsEndpoint": "http://<host>/<token>/api/otlp/metrics"
     }
   }
   ```

   > **Note:** Bei Verwendung des HTTP-Protokolls mit nur `otlpEndpoint` (ohne signal-spezifische Overrides) hängt Qwen Code die Standard-OTLP-Pfade (`/v1/traces`, `/v1/logs`, `/v1/metrics`) an die Basis-URL an. Wenn dein Backend andere Pfade verwendet, nutze signal-spezifische Endpunkt-Overrides wie in Option B gezeigt.

2. Wenn dein Alibaba Cloud-Endpunkt Authentifizierung erfordert, übergebe OTLP-Header über Standard-OpenTelemetry-Umgebungsvariablen wie `OTEL_EXPORTER_OTLP_HEADERS` (oder die signal-spezifischen Varianten). Qwen Code stellt OTLP-Auth-Header derzeit nicht direkt in `.qwen/settings.json` bereit.
3. Starte Qwen Code und sende Prompts.
4. Zeige die Telemetrie im Managed Service for OpenTelemetry an:
   - Produktübersicht:
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Erste Schritte:
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Konsolenzugänge:
     - Festlandchina:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (Legacy-Konsole:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - International:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - Verwende in der Konsole `Applications`, um Traces und Service-Topologien zu inspizieren.
   - So findest du den OTLP-Endpunkt und Zugriffsinformationen:
     - **Neue Konsole** (`trace.console.aliyun.com` oder international): Navigiere zu `Integration Center`.
     - **Legacy-Konsole** (`tracing.console.aliyun.com`): Navigiere zu `Cluster Configurations` → `Access point information`.

## Lokale Telemetrie

Für lokale Entwicklung und Debugging kannst du Telemetriedaten lokal erfassen:

### Dateibasierte Ausgabe (Empfohlen)

1. Aktiviere die Telemetrie in deiner `.qwen/settings.json`:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Note:** Wenn `outfile` gesetzt ist, wird der OTLP-Export automatisch deaktiviert. Die Einstellungen `target` und `otlpEndpoint` werden für die reine Dateiausgabe nicht benötigt und können sicher aus deiner Konfiguration weggelassen werden.

2. Starte Qwen Code und sende Prompts.
3. Zeige Logs und Metriken in der angegebenen Datei an (z. B. `.qwen/telemetry.log`).

### Collector-basierter Export (Erweitert)

1. Führe das Automatisierungs-Script aus:
   ```bash
   npm run telemetry -- --target=local
   ```
   Dies wird:
   - Jaeger und den OTEL-Collector herunterladen und starten
   - Deinen Workspace für lokale Telemetrie konfigurieren
   - Eine Jaeger-UI unter http://localhost:16686 bereitstellen
   - Logs/Metriken unter `~/.qwen/tmp/<projectHash>/otel/collector.log` speichern
   - Den Collector beim Beenden stoppen (z. B. `Strg+C`)
2. Starte Qwen Code und sende Prompts.
3. Zeige Traces unter http://localhost:16686 und Logs/Metriken in der Collector-Logdatei an.

## Logs und Metriken

Der folgende Abschnitt beschreibt die Struktur der für Qwen Code generierten Logs, Metriken und Spans.

- Eine `sessionId` ist als gemeinsames Attribut in allen Logs und Metriken enthalten.

### Logs

Logs sind Zeitstempel-basierte Aufzeichnungen spezifischer Ereignisse. Alle Log-Datensätze enthalten automatisch die Attribute `event.name` und `event.timestamp`.

Die folgenden Ereignisse werden geloggt:

#### Kern-Sitzungsereignisse

- `qwen-code.config`: Wird einmal beim Start mit der CLI-Konfiguration ausgegeben.
  - **Attribute**: `model`, `sandbox_enabled`, `core_tools_enabled`, `approval_mode`, `file_filtering_respect_git_ignore`, `debug_mode`, `truncate_tool_output_threshold`, `truncate_tool_output_lines`, `hooks` (kommagetrennt, weggelassen wenn deaktiviert), `ide_enabled`, `interactive_shell_enabled`, `mcp_servers`, `mcp_servers_count`, `mcp_tools`, `mcp_tools_count`, `output_format`, `skills`, `subagents`

- `qwen-code.user_prompt`: Benutzer reicht einen Prompt ein.
  - **Attribute**: `prompt_length` (int), `prompt_id` (string), `prompt` (string, ausgeschlossen wenn `log_prompts_enabled` false ist), `auth_type` (string)

- `qwen-code.user_retry`: Benutzer wiederholt den letzten Prompt.
  - **Attribute**: `prompt_id` (string)

- `qwen-code.conversation_finished`: Eine Sequenz von Konversationszügen wird abgeschlossen.
  - **Attribute**: `approvalMode` (string), `turnCount` (int)

- `qwen-code.user_feedback`: Benutzer reicht Sitzungsfeedback ein.
  - **Attribute**: `session_id` (string), `rating` (int: 1=schlecht, 2=okay, 3=gut), `model` (string), `approval_mode` (string), `prompt_id` (string, optional)

#### Tool-Ereignisse

- `qwen-code.tool_call`: Jeder Funktions-/Tool-Aufruf.
  - **Attribute**: `function_name` (string), `function_args` (object), `duration_ms` (int), `status` (string: "success", "error" oder "cancelled"), `success` (boolean), `decision` (string: "accept", "reject", "auto_accept" oder "modify", optional), `error` (string, optional), `error_type` (string, optional), `prompt_id` (string), `response_id` (string, optional), `content_length` (int, optional), `tool_type` (string: "native" oder "mcp"), `mcp_server_name` (string, optional), `metadata` (object, optional – enthält für Datei-Schreib-Tools `model_added_lines`, `model_removed_lines`, `user_added_lines`, `user_removed_lines`, `model_added_chars`, `model_removed_chars`, `user_added_chars`, `user_removed_chars`)

- `qwen-code.file_operation`: Jede Dateioperation.
  - **Attribute**: `tool_name` (string), `operation` (string: "create", "read", "update"), `lines` (int, optional), `mimetype` (string, optional), `extension` (string, optional), `programming_language` (string, optional)

- `qwen-code.tool_output_truncated`: Tool-Ausgabe hat den Größen-Schwellenwert überschritten.
  - **Attribute**: `tool_name` (string), `original_content_length` (int), `truncated_content_length` (int), `threshold` (int), `lines` (int), `prompt_id` (string)

#### API-Ereignisse

- `qwen-code.api_request`: Ausgehende Anfrage an die LLM-API.
  - **Attribute**: `model` (string), `prompt_id` (string), `request_text` (string, optional), `subagent_name` (string, optional)

- `qwen-code.api_response`: Von der LLM-API empfangene Antwort.
  - **Attribute**: `response_id` (string), `model` (string), `status_code` (int/string, optional), `duration_ms` (int), `input_token_count` (int), `output_token_count` (int), `cached_content_token_count` (int), `thoughts_token_count` (int), `total_token_count` (int), `prompt_id` (string), `auth_type` (string, optional), `response_text` (string, optional), `subagent_name` (string, optional)

- `qwen-code.api_error`: API-Anfrage fehlgeschlagen.
  - **Attribute**: `model` (string), `prompt_id` (string), `duration_ms` (int), `error_message` (string), `response_id` (string, optional), `auth_type` (string, optional), `error_type` (string, optional), `status_code` (int/string, optional), `subagent_name` (string, optional)

  Zusätzlich werden für die Kompatibilität OTel-Standard-Aliase (`http.status_code`, `error.message`, `model_name`, `duration`) ausgegeben.

- `qwen-code.api_cancel`: API-Anfrage vom Benutzer abgebrochen.
  - **Attribute**: `model` (string), `prompt_id` (string), `auth_type` (string, optional), `loop_wakeups_cancelled` (int, optional)

- `qwen-code.api_retry`: HTTP-Status-Retry (429/5xx) an einer LLM-Aufrufstelle. Unterscheidet sich von `chat.content_retry`, das `InvalidStreamError`-Retries mit einem separaten Budget behandelt.
  - **Attribute**: `model` (string), `prompt_id` (string, optional), `attempt_number` (int), `error_type` (string, optional), `error_message` (string), `status_code` (int/string, optional), `retry_delay_ms` (int), `duration_ms` (int, entspricht retry_delay_ms – Backoff-Sleep, nicht HTTP-Roundtrip; für die Versuchsdauer siehe den qwen-code.llm_request Span), `subagent_name` (string, optional)

- `qwen-code.malformed_json_response`: `generateJson`-Antwort konnte nicht geparst werden.
  - **Attribute**: `model` (string)

- `qwen-code.flash_fallback`: Wechsel zum Flash-Modell als Fallback.
  - **Attribute**: `auth_type` (string)

- `qwen-code.ripgrep_fallback`: Wechsel zu grep als Fallback.
  - **Attribute**: `use_ripgrep` (boolean), `use_builtin_ripgrep` (boolean), `error` (string, optional)

#### Resilience-Ereignisse

- `qwen-code.chat.content_retry`: Content-Error-Retry (z. B. leerer Stream).
  - **Attribute**: `attempt_number` (int), `error_type` (string), `retry_delay_ms` (int), `model` (string)

- `qwen-code.chat.content_retry_failure`: Alle Content-Retries aufgebraucht.
  - **Attribute**: `total_attempts` (int), `final_error_type` (string), `total_duration_ms` (int, optional), `model` (string)

- `qwen-code.chat.invalid_chunk`: Ungültiger Chunk aus dem Stream empfangen.
  - **Attribute**: `error.message` (string, optional)

#### Befehls- & Erweiterungs-Ereignisse

- `qwen-code.slash_command`: Benutzer führt einen Slash-Befehl aus.
  - **Attribute**: `command` (string), `subcommand` (string, optional), `status` (string: "success" oder "error", optional)

- `qwen-code.slash_command.model`: Benutzer wechselt das Modell über den `/model`-Befehl.
  - **Attribute**: `model_name` (string)

- `qwen-code.skill_launch`: Ein Skill wird gestartet.
  - **Attribute**: `skill_name` (string), `success` (boolean), `prompt_id` (string)

- `qwen-code.extension_install`: Erweiterung installiert.
  - **Attribute**: `extension_name` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.extension_uninstall`: Erweiterung deinstalliert.
  - **Attribute**: `extension_name` (string), `status` (string)

- `qwen-code.extension_enable`: Erweiterung aktiviert.
  - **Attribute**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_disable`: Erweiterung deaktiviert.
  - **Attribute**: `extension_name` (string), `setting_scope` (string)

- `qwen-code.extension_update`: Erweiterung aktualisiert.
  - **Attribute**: `extension_name` (string), `extension_id` (string), `extension_previous_version` (string), `extension_version` (string), `extension_source` (string), `status` (string: "success"/"error")

- `qwen-code.ide_connection`: IDE-Verbindungsereignis.
  - **Attribute**: `connection_type` (string: "start" oder "session")

- `qwen-code.auth`: Authentifizierungsereignis.
  - **Attribute**: `auth_type` (string), `action_type` ("auto", "manual", "coding-plan"), `status` ("success", "error", "cancelled"), `error_message` (optional)

#### Subagent-Ereignisse

- `qwen-code.subagent_execution`: Subagent-Lifecycle-Ereignis.
  - **Attribute**: `subagent_name` (string), `status` ("started", "completed", "failed", "cancelled"), `terminate_reason` (optional), `result` (optional), `execution_summary` (optional)

#### Arena-Ereignisse

- `qwen-code.arena_session_started`: Arena-Sitzung beginnt.
  - **Attribute**: `arena_session_id` (string), `model_ids` (JSON-String-Array), `task_length` (int)

- `qwen-code.arena_agent_completed`: Ein Arena-Agent schließt ab.
  - **Attribute**: `arena_session_id` (string), `agent_session_id` (string), `agent_model_id` (string), `status` (string: "completed"/"failed"/"cancelled"), `duration_ms` (int), `rounds` (int), `total_tokens` (int), `input_tokens` (int), `output_tokens` (int), `tool_calls` (int), `successful_tool_calls` (int), `failed_tool_calls` (int)

- `qwen-code.arena_session_ended`: Arena-Sitzung wird abgeschlossen.
  - **Attribute**: `arena_session_id` (string), `status` (string: "selected"/"discarded"/"failed"/"cancelled"), `duration_ms` (int), `display_backend` (string, optional), `agent_count` (int), `completed_agents` (int), `failed_agents` (int), `cancelled_agents` (int), `winner_model_id` (string, optional)

#### Workflow-Ereignisse

- `qwen-code.workflow_keyword`: Workflow-Keyword-Trigger ausgelöst.

- `qwen-code.workflow_run`: Workflow-Lauf hat den Endzustand erreicht.
  - **Attribute**: `status` (string), `agents_dispatched` (int), `agents_completed` (int), `phase_count` (int), `tokens_spent` (int), `duration_ms` (int)

#### Auto-Memory-Ereignisse

- `qwen-code.memory.extract`: Memory-Extraktionslauf abgeschlossen.
  - **Attribute**: `trigger` ("auto"/"manual"), `status` ("completed"/"skipped"/"failed"), `skipped_reason` (optional), `patches_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.dream`: Memory-Konsolidierungs- (Dream-) Lauf abgeschlossen.
  - **Attribute**: `trigger` ("auto"/"manual"), `status` ("updated"/"noop"/"failed"/"cancelled"), `deduped_entries` (int), `touched_topics_count` (int), `touched_topics` (string), `duration_ms` (int)

- `qwen-code.memory.recall`: Memory-Recall-Operation abgeschlossen.
  - **Attribute**: `query_length` (int), `docs_scanned` (int), `docs_selected` (int), `strategy` ("none"/"heuristic"/"model"), `duration_ms` (int)

#### Prompt-Vorschlags- & Spekulations-Ereignisse

- `qwen-code.prompt_suggestion`: Ergebnis des Prompt-Vorschlags.
  - **Attribute**: `outcome` ("accepted"/"ignored"/"suppressed"), `prompt_id` (optional), `accept_method` ("tab"/"enter"/"right", optional), `accept_source` ("live"/"fallback", optional), `time_to_accept_ms` (optional), `time_to_ignore_ms` (optional), `time_to_first_keystroke_ms` (optional), `suggestion_length` (optional), `similarity` (optional), `was_focused_when_shown` (optional), `reason` (optional)

- `qwen-code.speculation`: Ergebnis der spekulativen Ausführung.
  - **Attribute**: `outcome` ("accepted"/"aborted"/"failed"), `turns_used` (int), `files_written` (int), `tool_use_count` (int), `duration_ms` (int), `boundary_type` (optional), `had_pipelined_suggestion` (boolean)

#### Weitere Ereignisse

- `qwen-code.chat_compression`: Chat-Kontext komprimiert.
  - **Attribute**: `tokens_before` (int), `tokens_after` (int), `compression_input_token_count` (int, optional), `compression_output_token_count` (int, optional)

- `qwen-code.next_speaker_check`: Bestimmung des nächsten Sprechers.
  - **Attribute**: `prompt_id` (string), `finish_reason` (string), `result` (string)

- `loop_detected`: Schleife während der Agent-Ausführung erkannt. _(Hinweis: Wird ohne `qwen-code.`-Präfix ausgegeben – bestehende Inkonsistenz.)_
  - **Attribute**: `loop_type` (string), `prompt_id` (string)

- `kitty_sequence_overflow`: Kitty-Grafikprotokoll-Sequenz hat die Puffergröße überschritten. _(Hinweis: Wird ohne `qwen-code.`-Präfix ausgegeben – bestehende Inkonsistenz.)_
  - **Attribute**: `sequence_length` (int), `truncated_sequence` (string, erste 20 Zeichen)

### Metriken

Metriken sind numerische Messungen des Verhaltens über die Zeit. Metriknamen verwenden das Präfix `qwen-code.*`.

#### Kernmetriken

- `qwen-code.session.count` (Counter, Int): Wird einmal pro CLI-Start erhöht.

- `qwen-code.tool.call.count` (Counter, Int): Zählt Tool-Aufrufe.
  - **Attribute**: `function_name`, `success` (boolean), `decision` ("accept"/"reject"/"auto_accept"/"modify", optional), `tool_type` ("mcp"/"native", optional)

- `qwen-code.tool.call.latency` (Histogram, ms): Misst die Tool-Aufruf-Latenz.
  - **Attribute**: `function_name` (string)

- `qwen-code.api.request.count` (Counter, Int): Zählt alle API-Anfragen.
  - **Attribute**: `model`, `status_code`, `error_type` (optional)

- `qwen-code.api.request.latency` (Histogram, ms): Misst die API-Anfrage-Latenz.
  - **Attribute**: `model` (string)

- `qwen-code.token.usage` (Counter, Int): Zählt die verwendeten Tokens.
  - **Attribute**: `model`, `type` ("input"/"output"/"thought"/"cache")

- `qwen-code.file.operation.count` (Counter, Int): Zählt Dateioperationen.
  - **Attribute**: `operation` ("create"/"read"/"update"), `lines` (optional), `mimetype` (optional), `extension` (optional), `programming_language` (optional)

- `qwen-code.chat_compression` (Counter, Int): Zählt Chat-Komprimierungsoperationen.
  - **Attribute**: `tokens_before` (int), `tokens_after` (int)

- `qwen-code.slash_command.model.call_count` (Counter, Int): Zählt Aufrufe des Model-Slash-Befehls.
  - **Attribute**: `slash_command.model.model_name` (string)

- `qwen-code.subagent.execution.count` (Counter, Int): Zählt Subagent-Ausführungsereignisse.
  - **Attribute**: `subagent_name`, `status` ("started"/"completed"/"failed"/"cancelled"), `terminate_reason` (optional)

#### Resilience-Metriken

- `qwen-code.api.retry.count` (Counter, Int): HTTP-Status-Retries (429/5xx) an LLM-Aufrufstellen.
  - **Attribute**: `model` (string)

- `qwen-code.chat.content_retry.count` (Counter, Int): Retries aufgrund von Content-Fehlern.

- `qwen-code.chat.content_retry_failure.count` (Counter, Int): Alle Content-Retries aufgebraucht.

- `qwen-code.chat.invalid_chunk.count` (Counter, Int): Ungültige Chunks aus dem Stream.

#### Arena-Metriken

- `qwen-code.arena.session.count` (Counter, Int): Arena-Sitzungen nach Status.
  - **Attribute**: `status`, `display_backend` (optional)
- `qwen-code.arena.session.duration` (Histogram, ms): Arena-Session-Dauer.
  - **Attributes**: `status`

- `qwen-code.arena.agent.count` (Counter, Int): Arena-Agent-Completions.
  - **Attributes**: `status`, `model_id`

- `qwen-code.arena.agent.duration` (Histogram, ms): Arena-Agent-Ausführungsdauer.
  - **Attributes**: `model_id`

- `qwen-code.arena.agent.tokens` (Counter, Int): Token-Nutzung durch Arena-Agents.
  - **Attributes**: `model_id`, `type` ("input"/"output")

- `qwen-code.arena.result.selected` (Counter, Int): Auswahlen der Arena-Ergebnisse.
  - **Attributes**: `model_id`

#### Auto-Memory-Metriken

- `qwen-code.memory.extract.count` (Counter, Int): Auto-Memory-Extraktionsläufe.
  - **Attributes**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.extract.duration` (Histogram, ms): Extraktionsdauer.
  - **Attributes**: `trigger`, `status`

- `qwen-code.memory.dream.count` (Counter, Int): Auto-Memory-Dream-Läufe.
  - **Attributes**: `trigger` ("auto"/"manual"), `status`

- `qwen-code.memory.dream.duration` (Histogram, ms): Dream-Laufdauer.
  - **Attributes**: `trigger`, `status`

- `qwen-code.memory.recall.count` (Counter, Int): Auto-Memory-Recall-Operationen.
  - **Attributes**: `strategy` ("none"/"heuristic"/"model")

- `qwen-code.memory.recall.duration` (Histogram, ms): Recall-Dauer.
  - **Attributes**: `strategy`

#### API-Request-Aufschlüsselung

- `qwen-code.api.request.breakdown` (Histogram, ms): Aufschlüsselung der API-Request-Zeit nach Phase.
  - **Attributes**: `model`, `phase` ("request_preparation"/"network_latency"/"response_processing"/"token_processing")

### Daemon-Metriken

Der Daemon-Prozess (langlaufender HTTP-Server-Modus) stellt seine eigenen Metriken bereit.

> **Note:** Die drei Observable Gauges (`daemon.session.active`, `daemon.sse.active`, `daemon.process.heap_used`) sind callback-basierte Metriken, die in jedem Sammelintervall aktualisiert werden; `registerDaemonGaugeCallbacks()` muss während der Daemon-Initialisierung aufgerufen werden, um die Beobachtungs-Callbacks zu registrieren.

#### HTTP

- `qwen-code.daemon.http.request.count` (Counter, Int): Request-Anzahl nach Route und Statusklasse.
  - **Attributes**: `route`, `status_class` ("2xx"/"4xx"/"5xx")

- `qwen-code.daemon.http.request.duration` (Histogram, ms): Request-Dauer.
  - **Attributes**: `route`
  - **Buckets**: 1, 2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000

#### Sessions

- `qwen-code.daemon.session.active` (ObservableGauge, Int): Aktuell aktive Sessions.

- `qwen-code.daemon.session.lifecycle` (Counter, Int): Session-Lifecycle-Events.
  - **Attributes**: `action` ("spawn"/"close"/"die")

#### Channels

- `qwen-code.daemon.channel.lifecycle` (Counter, Int): ACP-Channel-Lifecycle-Events.
  - **Attributes**: `action` ("spawn"/"exit"), `expected` (boolean, optional)

#### Prompts

- `qwen-code.daemon.prompt.queue_wait` (Histogram, ms): Prompt-FIFO-Queue-Wartezeit.
  - **Buckets**: 1, 5, 10, 50, 100, 500, 1000, 5000, 10000, 30000, 60000

- `qwen-code.daemon.prompt.duration` (Histogram, ms): End-to-End-Prompt-Dauer.
  - **Buckets**: 100, 500, 1000, 2500, 5000, 10000, 30000, 60000, 120000, 300000, 600000

#### Errors

- `qwen-code.daemon.bridge.error.count` (Counter, Int): Bridge-Fehler nach Typ.
  - **Attributes**: `error_type` (bekannter Klassenname oder "unknown")

- `qwen-code.daemon.cancel.count` (Counter, Int): Cancel-Request-Anzahl.

#### Resources

- `qwen-code.daemon.sse.active` (ObservableGauge, Int): Aktive SSE-Verbindungen.

- `qwen-code.daemon.process.heap_used` (ObservableGauge, Int, bytes): Heap-Speicherauslastung.

### Spans

Distributed-Tracing-Spans bilden einen Baum, der in `qwen-code.interaction` verwurzelt ist. Jede Interaktion ist ein Trace-Root mit einer eigenen `traceId`; die promptübergreifende Korrelation verwendet das `session.id`-Attribut.

- `qwen-code.interaction`: Root-Span für jeden User-Prompt-Turn.
  - **Attributes**: `session.id`, `qwen-code.prompt_id`, `qwen-code.message_type`, `qwen-code.model`, `qwen-code.approval_mode`, `interaction.sequence`, `interaction.duration_ms`, `qwen-code.turn_status` ("ok"/"error"/"cancelled")

- `qwen-code.llm_request`: Umschließt einen einzelnen LLM-API-Call.
  - **Attributes**: `session.id`, `qwen-code.model`, `qwen-code.prompt_id`, `llm_request.context` ("subagent"/"interaction"/"standalone"), `gen_ai.request.model`, `duration_ms`, `input_tokens`, `output_tokens`, `cached_input_tokens`, `ttft_ms`, `request_setup_ms`, `attempt`, `retry_total_delay_ms`, `sampling_ms`, `output_tokens_per_second`, `success`, `error`, `response_id`, `finish_reason`, `thoughts_token_count`, `subagent_name`, `error_type`, `error_status_code`

- `qwen-code.tool`: Umschließt den gesamten Tool-Lifecycle (Approval-Wait + Execution).
  - **Attributes**: `session.id`, `tool.name`, `duration_ms`, `success`, `error`

- `qwen-code.tool.execution`: Umschließt die Tool-Execution-Phase (nach der Approval).
  - **Attributes**: `session.id`, `duration_ms`, `success`, `error`

- `qwen-code.tool.blocked_on_user`: Zeit, die ein Tool mit dem Warten auf die User-Approval verbringt.
  - **Attributes**: `session.id`, `tool.name`, `tool.call_id`, `duration_ms`, `decision` ("proceed_once"/"proceed_always"/"cancel"/"aborted"/"auto_approved"/"error"), `source` ("cli"/"ide"/"hook"/"auto"/"system")

- `qwen-code.hook`: Umschließt jede Pre/Post-Tool-Use-Hook-Fire-Site.
  - **Attributes**: `session.id`, `hook_event` ("PreToolUse"/"PostToolUse"/"PostToolUseFailure"/"PostToolBatch"), `tool.name`, `tool.use_id` (optional), `is_interrupt` (boolean, optional), `duration_ms`, `success`, `should_proceed` (optional), `should_stop` (optional), `block_type` (optional), `error` (optional)

- `qwen-code.subagent`: Umschließt einen einzelnen Subagent-Aufruf.
  - **Attributes**: `gen_ai.operation.name`, `gen_ai.provider.name`, `gen_ai.agent.id`, `gen_ai.agent.name`, `gen_ai.conversation.id`, `qwen-code.subagent.id`, `qwen-code.subagent.name`, `qwen-code.subagent.invocation_kind` ("foreground"/"fork"/"background"), `qwen-code.subagent.is_built_in`, `qwen-code.subagent.depth`, `qwen-code.subagent.status`, `qwen-code.subagent.terminate_reason`, `qwen-code.subagent.duration_ms`

- `qwen-code.daemon.request`: Umschließt einen Daemon-HTTP-Request.
  - **Attributes**: `http.request.method`, `http.route`, `qwen-code.daemon.operation`, `session.id`, `http.response.status_code`

- `qwen-code.daemon.bridge`: Umschließt Daemon-Bridge-Operationen.
  - **Attributes**: `qwen-code.daemon.operation`

#### Resource-Metriken

- `qwen-code.memory.usage` (Histogram, bytes): Speicherauslastung. Wird vom Memory-Pressure-Monitor aufgezeichnet, wenn Telemetrie aktiviert ist.
  - **Attributes**: `memory_type` (string: "heap_used"/"rss")

- `qwen-code.cpu.usage` (Histogram, percent): CPU-Auslastung in Prozent. Wird vom Memory-Pressure-Monitor aufgezeichnet, wenn Telemetrie aktiviert ist.
  - **Attributes**: (none)

### Performance Monitoring (Reserviert)

Die folgenden Metriken sind definiert, aber **noch nicht in der Produktion aktiviert**. Sie werden hinter einem dedizierten Performance-Monitoring-Config-Flag aktiviert.

- `qwen-code.startup.duration` (Histogram, ms): CLI-Startup-Zeit nach Phase.
  - **Attributes**: `phase` (string)

- `qwen-code.tool.queue.depth` (Histogram, count): Tools in der Execution-Queue.

- `qwen-code.tool.execution.breakdown` (Histogram, ms): Tool-Execution-Zeit nach Phase.
  - **Attributes**: `function_name`, `phase` ("validation"/"preparation"/"execution"/"result_processing")

- `qwen-code.token.efficiency` (Histogram, ratio): Token-Effizienz-Metriken.
  - **Attributes**: `model`, `metric`, `context` (optional)

- `qwen-code.performance.score` (Histogram, score): Zusammengesetzter Performance-Score (0-100).
  - **Attributes**: `category`, `baseline` (optional)

- `qwen-code.performance.regression` (Counter, Int): Regression-Detection-Events.
  - **Attributes**: `metric`, `severity` ("low"/"medium"/"high"), `current_value`, `baseline_value`

- `qwen-code.performance.regression.percentage_change` (Histogram, percent): Prozentuale Änderung gegenüber der Baseline.
  - **Attributes**: `metric`, `severity`, `current_value`, `baseline_value`

- `qwen-code.performance.baseline.comparison` (Histogram, percent): Performance im Vergleich zur Baseline.
  - **Attributes**: `metric`, `category`, `current_value`, `baseline_value`