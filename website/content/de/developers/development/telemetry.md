# Observability mit OpenTelemetry

Erfahren Sie, wie Sie OpenTelemetry für Qwen Code aktivieren und konfigurieren.

- [Observability mit OpenTelemetry](#observability-mit-opentelemetry)
  - [Hauptvorteile](#hauptvorteile)
  - [OpenTelemetry-Integration](#opentelemetry-integration)
  - [Konfiguration](#konfiguration)
  - [Aliyun Telemetrie](#aliyun-telemetrie)
    - [Manueller OTLP-Export](#manueller-otlp-export)
  - [Lokale Telemetrie](#lokale-telemetrie)
    - [Dateibasierte Ausgabe (Empfohlen)](#dateibasierte-ausgabe-empfohlen)
    - [Collector-basierter Export (Fortgeschritten)](#collector-basierter-export-fortgeschritten)
  - [Logs und Metriken](#logs-und-metriken)
    - [Logs](#logs)
    - [Metriken](#metriken)

## Hauptvorteile

- **🔍 Nutzungsanalyse**: Verstehen Sie Interaktionsmuster und Feature-Akzeptanz im Team
- **⚡ Leistungsüberwachung**: Verfolgen Sie Antwortzeiten, Token-Verbrauch und Ressourcennutzung
- **🐛 Echtzeit-Debugging**: Identifizieren Sie Engpässe, Fehler und Fehlermuster, während sie auftreten
- **📊 Workflow-Optimierung**: Treffen Sie fundierte Entscheidungen zur Verbesserung von Konfigurationen und Prozessen
- **🏢 Unternehmens-Governance**: Überwachen Sie die Nutzung über Teams hinweg, verfolgen Sie Kosten, stellen Sie Compliance sicher und integrieren Sie sich in bestehende Monitoring-Infrastrukturen

## OpenTelemetry-Integration

Das Observability-System von Qwen Code basiert auf **[OpenTelemetry]** – dem anbieterneutralen Industriestandard-Framework für Observability – und bietet:

- **Universelle Kompatibilität**: Export in jedes OpenTelemetry-Backend (Aliyun, Jaeger, Prometheus, Datadog usw.)
- **Standardisierte Daten**: Konsistente Formate und Erfassungsmethoden in Ihrer Toolchain
- **Zukunftssichere Integration**: Anbindung an bestehende und zukünftige Observability-Infrastrukturen
- **Keine Anbieterbindung**: Wechsel zwischen Backends ohne Änderung Ihrer Instrumentierung

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Konfiguration

Das gesamte Telemetrie-Verhalten wird über Ihre `.qwen/settings.json`-Datei gesteuert. Diese Einstellungen können durch Umgebungsvariablen oder CLI-Flags überschrieben werden.

| Einstellung                          | Umgebungsvariable                                        | CLI-Flag                                                 | Beschreibung                                                                                                                                                  | Werte             | Standard                |
| ------------------------------------ | -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`                            | `QWEN_TELEMETRY_ENABLED`                                 | `--telemetry` / `--no-telemetry`                        | Telemetrie aktivieren oder deaktivieren                                                                                                                       | `true`/`false`    | `false`                 |
| `target`                             | `QWEN_TELEMETRY_TARGET`                                  | `--telemetry-target <local\|gcp>` _(deprecated)_          | Informatives Ziel-Label; steuert nicht das Exporter-Routing – setzen Sie `otlpEndpoint` oder `outfile`, um zu konfigurieren, wohin Daten gesendet werden      | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                       | `QWEN_TELEMETRY_OTLP_ENDPOINT`                           | `--telemetry-otlp-endpoint <URL>`                        | OTLP-Collector-Endpunkt                                                                                                                                       | URL-String        | `http://localhost:4317` |
| `otlpProtocol`                       | `QWEN_TELEMETRY_OTLP_PROTOCOL`                           | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP-Transportprotokoll                                                                                                                                       | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`                 | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                    | -                                                        | Signal-spezifischer Endpunkt-Override für Traces (nur HTTP)                                                                                                   | URL-String        | -                       |
| `otlpLogsEndpoint`                   | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                      | -                                                        | Signal-spezifischer Endpunkt-Override für Logs (nur HTTP)                                                                                                     | URL-String        | -                       |
| `otlpMetricsEndpoint`                | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`                   | -                                                        | Signal-spezifischer Endpunkt-Override für Metriken (nur HTTP)                                                                                                 | URL-String        | -                       |
| `outfile`                            | `QWEN_TELEMETRY_OUTFILE`                                 | `--telemetry-outfile <path>`                             | Telemetrie in Datei speichern (überschreibt OTLP-Export)                                                                                                      | Dateipfad         | -                       |
| `logPrompts`                         | `QWEN_TELEMETRY_LOG_PROMPTS`                             | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Prompts in Telemetrie-Logs einschließen                                                                                                                        | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`     | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`       | -                                                        | Benutzer-Prompts, System-Prompts, Tool-I/O und Modellausgabe als native Span-Attribute einschließen (zusätzlich zu log-to-span Bridge-Spans)                  | `true`/`false`    | `false`                 |
| `sensitiveSpanAttributeMaxLength`    | `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH`     | -                                                        | Maximale JavaScript-String-Länge für jeden sensiblen nativen Span-Attribut-Inhalt. Niedriger setzen, wenn Ihr Backend große Attribute ablehnt.               | `1..104857600`    | `1048576`               |
| `resourceAttributes`                 | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)       | -                                                        | Statische Ressourcen-Attribute, die an jeden exportierten Span / Log / Metrik angehängt werden. Siehe [Ressourcen-Attribute](#ressourcen-attribute) unten.     | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`           | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`              | -                                                        | `session.id` auf Metrik-Datenpunkte einschließen. **Standardmäßig deaktiviert**, um Metrik-Backends vor Zeitreihen-Aufblähung zu schützen.                     | `true`/`false`    | `false`                 |

**Hinweis zu booleschen Umgebungsvariablen:** Bei den booleschen Einstellungen (`enabled`, `logPrompts`, `includeSensitiveSpanAttributes`) wird die Funktion aktiviert, wenn die entsprechende Umgebungsvariable auf `true` oder `1` gesetzt ist. Jeder andere Wert deaktiviert sie.

**Hinweis zu ganzzahligen Umgebungsvariablen:** `QWEN_TELEMETRY_SENSITIVE_SPAN_ATTRIBUTE_MAX_LENGTH` muss, wenn gesetzt, eine positive Ganzzahl sein. Ungültige Werte führen zum Fehlschlagen der Telemetrie-Konfigurationsauflösung, anstatt stillschweigend auf den Standard zurückzufallen.

**Sensitive Span-Attribute:** Wenn `includeSensitiveSpanAttributes` aktiviert ist, passieren zwei Dinge:

1. **Native Span-Attribute (`qwen-code.interaction`, `api.generateContent*`, `tool.<name>`)** tragen wortgetreuen Gesprächsinhalt:
   - Benutzer-Prompts (`new_context`)
   - System-Prompts (`system_prompt` – vollständiger Text einmal pro Session, dedupliziert per SHA-256-Hash; nachfolgende Spans enthalten nur `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`)
   - Tool-Schemas (als `tool_schema`-Events ausgegeben, ebenfalls Hash-dedupliziert)
   - Tool-Eingaben (`tool_input`) und Tool-Ergebnisse (`tool_result`)
   - Modellausgabe (`response.model_output`)

   Jeder Inhalts-Payload wird auf `sensitiveSpanAttributeMaxLength` JavaScript-String-Einheiten gekürzt. Der Standard ist 1 MiB (`1048576`), erhöht vom vorherigen 60 KiB-Standard; setzen Sie `61440`, um die alte Grenze beizubehalten. Das Limit muss zwischen `1` und `104857600` (100 MiB) liegen. Bei benannten Attributen zählen feste Labels wie `[USER PROMPT]`, `[TOOL INPUT: ...]` und `[TOOL RESULT: ...]` gegen die Grenze; der Trunkierungsmarker zählt ebenfalls dagegen. Das Limit wird als JavaScript-String-Länge gemessen, nicht als UTF-8-Bytes. Nicht-ASCII-Inhalte können daher nach dem OTLP-Export mehr Bytes belegen. Für die meisten Payload-Typen fügt die Trunkierung sowohl `*_truncated` als auch `*_original_length` hinzu. System-Prompts setzen bei Trunkierung ebenfalls `system_prompt_truncated`, verwenden aber das immer vorhandene `system_prompt_length` für die Originallänge.

2. **Log-to-span Bridge-Spans** (die verwendet werden, wenn HTTP-Traces ohne Logs-Endpunkt exportiert werden) behalten ihre vorhandenen `prompt`-, `function_args`- und `response_text`-Felder bei, anstatt verworfen zu werden.

⚠️ **Sicherheitswarnung:** Das Aktivieren dieses Flags überträgt den vollständigen Gesprächsverlauf, Dateiinhalte, die von `read_file` gelesen wurden, Shell-Befehle und deren Ausgabe (einschließlich Geheimnisse in Umgebungsvariablen oder Argumenten) sowie Modellantworten an das konfigurierte OTLP-Backend. Behandeln Sie das Backend als privilegierten Daten-Sink. Das Flag ist standardmäßig `false`.

**Kosten / Payload-Größe:** Ein schwerer Durchlauf beim Standardlimit (1 MiB System-Prompt plus 10 Tool-Aufrufe, jeder bis zu 1 MiB Eingabe + 1 MiB Ergebnis, plus 1 MiB Modellausgabe) kann bis zu ~22 MiB Attribut-Payload vor OTLP-Kompression erzeugen, plus bis zu 1 MiB pro ausgegebenem Tool-Schema in Workspaces mit großen Tool-Definitionen. Dies ist die anwendungsseitige Grenze von Qwen Code, keine Garantie, dass jeder Collector oder jedes Backend ein einzelnes Attribut dieser Größe akzeptiert. Wenn Spans abgelehnt oder verworfen werden, senken Sie `sensitiveSpanAttributeMaxLength` (z. B. auf `61440`) und überwachen Sie den Exporter-Durchsatz.

Diese Einstellung deaktiviert keine sensiblen Daten in OTel-Logs oder anderen Telemetrie-Senken; Nicht-Intern-API-Antworttelemetrie kann `response_text` enthalten, sodass OTel-Logs, UI-Telemetrie und Chat-Aufzeichnungen Antworttext unabhängig von dieser Einstellung erhalten können. QwenLogger enthält kein `response_text`.

**HTTP OTLP-Signal-Routing:** Bei Verwendung des HTTP-Protokolls (`otlpProtocol: "http"`) hängt Qwen Code automatisch signal-spezifische Pfade (`/v1/traces`, `/v1/logs`, `/v1/metrics`) an den Basis-`otlpEndpoint` an. Beispielsweise wird `http://collector:4318` zu `http://collector:4318/v1/traces` für Traces. Wenn die URL bereits mit einem Signalpfad endet, wird sie unverändert verwendet. Signal-spezifische Endpunkt-Overrides (`otlpTracesEndpoint` usw.) haben Vorrang vor dem Basis-Endpunkt und werden wortwörtlich verwendet. Das gRPC-Protokoll verwendet service-basiertes Routing und hängt keine Pfade an.

Die Umgebungsvariablen für signal-spezifische Endpunkte akzeptieren auch die Standard-OpenTelemetry-Namen: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`, `OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`. Die `QWEN_TELEMETRY_OTLP_*`-Varianten haben Vorrang vor den `OTEL_*`-Varianten.

Detaillierte Informationen zu allen Konfigurationsoptionen finden Sie im [Konfigurationshandbuch](../../users/configuration/settings.md).

### Ressourcen-Attribute

Ressourcen-Attribute sind statische Schlüssel-Wert-Paare, die an jeden über OTLP exportierten Span, Log und jede Metrik angehängt werden. Verwenden Sie sie, um Telemetrie nach Team, Umgebung, Deployment-Region oder jeder anderen Dimension zu segmentieren, die Ihr Backend unterstützt.

Zwei Quellen, zusammengeführt in Prioritätsreihenfolge (niedrig → hoch):

1. Die Standard-Umgebungsvariable `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` in `.qwen/settings.json` (überschreibt die Umgebungsvariable bei Schlüsselkonflikten)

`OTEL_SERVICE_NAME` ist eine separate Ausnahme – wenn gesetzt, überschreibt es `service.name` aus jeder anderen Quelle (gemäß dem OpenTelemetry-Spezifikation).

#### Beispiele

**Telemetrie nach Team/Umgebung segmentieren:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**Routing zu einem tenant-spezifischen Collector über `service.name`:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Basis-Fleet-Konfiguration (`~/.qwen/settings.json`) + host-spezifischer Override:**

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
# Einmaligen Tag hinzufügen, ohne die Einstellungen zu ändern:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Reservierte Schlüssel

Einige Schlüssel werden zur Laufzeit gesteuert und können nicht überschrieben werden:

- `service.version` – immer auf die laufende CLI-Version gesetzt. Wird aus keiner Quelle überschrieben; wird stillschweigend mit einer Warnung verworfen.
- `session.id` – wird zur Laufzeit pro Session eingefügt. Benutzerdefinierte Werte aus Umgebungsvariablen oder Einstellungen werden mit einer Warnung verworfen. Der Grund ist, dass Ressourcen-Attribute automatisch an jeden Metrik-Datenpunkt angehängt werden; ein Überschreiben durch den Benutzer würde die unten stehenden [Kardinalitätskontrollen](#kardinalitätskontrollen) umgehen. Spans und Logs tragen immer `session.id`.

`service.name` ist **nicht** reserviert; es folgt der oben beschriebenen Prioritätskette.

#### Format

`OTEL_RESOURCE_ATTRIBUTES` folgt der OpenTelemetry-Spezifikation: `key1=value1,key2=value2` mit percent-kodierten Werten. Leerzeichen in Werten müssen als `%20` kodiert werden, **Kommas als `%2C`** (unkodierte Kommas teilen den Wert an der falschen Stelle, die zweite Hälfte wird als fehlerhaft verworfen). Fehlerhafte Paare werden mit einer Warnung übersprungen, anstatt den Telemetrie-Start fehlschlagen zu lassen.

#### Fehlerbehebung: Wenn ein benutzerdefiniertes Attribut scheinbar nicht wirkt

Reservierte Schlüssel (`service.version`, `session.id`), fehlerhafte Paare, Nicht-String-Einstellungswerte und ungültige Percent-Kodierung werden alle stillschweigend mit einer Warnung verworfen, die über den OpenTelemetry-Diagnosekanal protokolliert wird. Dieser Kanal leitet in die Debug-Log-Datei (`~/.qwen/log/otel-*.log`) um, **nicht** auf die Konsole, sodass das Verhalten wie ein stillschweigender Fehler aussehen kann.

Wenn ein benutzerdefiniertes Ressourcen-Attribut nicht in der exportierten Telemetrie erscheint:

1. Überprüfen Sie `~/.qwen/log/otel-*.log` auf Zeilen, die `cannot override` (reservierter Schlüssel verworfen), `Skipping malformed` (fehlerhaftes Umgebungsvariablen-Paar) oder `must be a string` (Nicht-String-Einstellungswert) enthalten.
2. Stellen Sie sicher, dass die Umgebungsvariable in der Umgebung des qwen-code-Prozesses gesetzt ist (nicht nur in Ihrer Shell) und dass die Werte percent-kodiert sind.
3. Bestätigen Sie, dass `telemetry.enabled` `true` ist – die Telemetrie-Initialisierung läuft nur, wenn sie aktiviert ist.

### Kardinalitätskontrollen

Metriken werden im Backend nach Attributsätzen aggregiert – jede eindeutige Kombination von Attributswerten erzeugt eine neue Zeitreihe. Das Anhängen eines hochkardinalen Felds wie `session.id` an eine Metrik führt zu einer Zeitreihen-Aufblähung proportional zur Anzahl der Sessions, was schnell den Metrik-Backend-Speicher erschöpft.

Um dies zu verhindern, hält Qwen Code standardmäßig hochkardinale Attribute von Metrik-Datenpunkten fern. Spans und Logs sind ereignisbasiert und nicht betroffen, sodass sie weiterhin `session.id` für Trace- und Log-Korrelation tragen.

#### `telemetry.metrics.includeSessionId` (Standard: `false`)

Das Setzen auf `true` (über Einstellungen oder `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) fügt `session.id` wieder an jeden Metrik-Datenpunkt an.

⚠️ **Warnung:** Jede CLI-Session erzeugt einen neuen Wert. Wenn Sie dies für ein ganzes Fleet aktiviert lassen, sprengt das den Metrik-Speicher. Nur für kurzfristiges Debugging empfohlen. Für langfristige Session-Korrelation fragen Sie stattdessen Trace- oder Log-Backends ab.

#### Migration von früheren Versionen

Vor dieser Version war `session.id` standardmäßig an Metriken angehängt. Wenn Ihre Prometheus-Abfragen / Grafana-Dashboards / Alert-Regeln auf `session_id` in einer Metrik verweisen, haben Sie zwei Optionen:

**Option A** – Stellen Sie das vorherige Verhalten für kurzfristiges Debugging wieder her:

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

**Option B (empfohlen)** – Verlagern Sie die Session-Analyse von Metriken auf Spans/Logs. Spans und Logs tragen weiterhin `session.id`, und Trace-/Log-Backends (Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) unterstützen die Session-segmentierte Analyse nativ ohne Kardinalitätsdruck.

### Clientseitiger HTTP-Span bei ausgehenden fetch-Aufrufen

Wenn Telemetrie aktiviert ist, registriert Qwen Code `UndiciInstrumentation`, das für jeden ausgehenden `fetch()`-Aufruf, der vom Prozess ausgeht, einen clientseitigen HTTP-Span erstellt – einschließlich der LLM-SDKs (`openai`, `@google/genai`, `@anthropic-ai/sdk`), des MCP StreamableHTTP-Clients, des `WebFetch`-Tools und aller IDE-Erweiterungs-Aufrufe außerhalb des Prozesses. Der Span ermöglicht es Ihnen, die Netzwerklatenz (TTFB / Antwortkörperübertragung) getrennt von der upstream-Modellverarbeitungszeit zu sehen, die der vorhandene `api.generateContent`-Span allein nicht unterscheiden kann.

Diese Spans gehen an Ihren **eigenen** OTLP-Collector (oder die Datei-Ausgabedatei) genau wie der Rest der Telemetrie – sie haben keinen Einfluss darauf, was in die ausgehende HTTP-Anfrage selbst geschrieben wird. Ob der W3C-`traceparent`-Header auch in den ausgehenden Anfragestream geschrieben wird, wird durch eine **separate, sicherheitsrelevante Einstellung** gesteuert, die unten unter [Ausgehende Korrelation](#ausgehende-korrelation-sicherheitsrelevant) dokumentiert ist.

**Feedback-Loop-Vermeidung.** Das OTel-SDK verwendet `fetch` intern zum Hochladen von OTLP-Daten. Ohne Schutz würde die Instrumentierung von `fetch` diese Uploads tracen, die selbst hochgeladen würden, was eine Endlosschleife verursachen würde. Die undici-Instrumentierung von Qwen Code ist mit einem `ignoreRequestHook` konfiguriert, der URLs überspringt, die mit den konfigurierten `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint`-Präfixen übereinstimmen. Im Datei-Ausgabe-Modus gibt es keine ausgehenden HTTP-Uploads, sodass der Hook ein No-Op ist.

## Ausgehende Korrelation (SICHERHEITSRELEVANT)

Diese Einstellungen befinden sich absichtlich in einem **separaten Top-Level-Namespace** von `telemetry.*`: Telemetrie steuert den Datenfluss in das eigene Observability-Backend des Betreibers, während `outboundCorrelation.*` steuert, welche clientseitigen Korrelationsdaten qwen-code **in die ausgehenden LLM-API-Anfrageströme** schreibt, die Drittanbieter-LLM-Anbieter-Endpunkte (DashScope, OpenAI, Anthropic usw.) erreichen. Unterschiedliche Empfänger, unterschiedliche Zustimmungsentscheidung. **Alle Werte sind standardmäßig deaktiviert.** Siehe die PR-#4390-Review-Diskussion für das Begründungs-Rationale.

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // Standard
}
```

Wenn `false` (Standard), installiert Qwen Code einen No-Op-`TextMapPropagator` im OTel-SDK. UndiciInstrumentation erstellt weiterhin clientseitige HTTP-Spans für Ihren OTLP-Collector, aber `propagation.inject()` ist ein No-Op, sodass **kein `traceparent` in ausgehende Anfragen geschrieben wird**. Trace-IDs bleiben intern beim Collector des Betreibers.

Wenn `true`, wird der standardmäßige W3C-Composite-Propagator des SDKs (`tracecontext` + `baggage`) installiert und der standardmäßige `traceparent`-Header wird bei jedem ausgehenden `fetch` geschrieben:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Opt-in nur, wenn der LLM-Anbieter ebenfalls in Ihren OTel-Collector berichtet (z. B. ARMS Tracing für DashScope), um eine prozessübergreifende Trace-Verknüpfung zu ermöglichen. Für die meisten Betreiber ist der Wert `false`; anbieterübergreifende Trace-Fortsetzung ist ein Nischenfall.
**Hängt von `telemetry.enabled: true` ab.** Das OTel SDK wird nur initialisiert, wenn Telemetrie aktiviert ist. Daher wirkt sich `propagateTraceContext` nur in diesem Zustand aus. Die Einstellung auf `true` bei deaktivierter Telemetrie ist ein stiller No-Op – kein SDK, kein Propagator, kein `traceparent` auf der Leitung. Prüfen Sie beide Flags, wenn Sie eine ARMS+DashScope-Korrelationskonfiguration aufsetzen:

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

`X-Qwen-Code-Session-Id` und `X-Qwen-Code-Request-Id` sind **nicht Teil dieses PRs**. Sie werden in eigenen Folge-PR(s) unter demselben Namespace `outboundCorrelation.*` entworfen und vorgeschlagen, jeweils mit eigenem Bedrohungsmodell und Operator-Zustimmungsverfahren. Das PR-Review (#4390, LaZzyMan) hat das Prinzip etabliert: „Der Umfang der Telemetrie umfasst nicht das Senden von Identifikatoren an LLM-Anbieter"; die Arbeiten an Korrelations-Headers werden in eine eigene Design-Diskussion verschoben und nicht unter der Telemetrie umgesetzt.

## Aliyun Telemetry

### Manueller OTLP-Export

Um Qwen Code Telemetrie im Alibaba Cloud Managed Service for OpenTelemetry anzuzeigen, konfigurieren Sie Qwen Code so, dass es an den von ARMS bereitgestellten OTLP-Endpunkt exportiert.

Die alleinige Einstellung von `"target": "gcp"` konfiguriert das Exportziel nicht. Wenn `otlpEndpoint` nicht gesetzt ist, verwendet Qwen Code standardmäßig `http://localhost:4317`. Wenn `outfile` gesetzt ist, überschreibt es `otlpEndpoint` und die Telemetrie wird in die Datei geschrieben, anstatt an Alibaba Cloud gesendet zu werden.

1. Aktivieren Sie Telemetrie in Ihrer `.qwen/settings.json` und setzen Sie den OTLP-Endpunkt:

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

   **Option B: HTTP-Protokoll mit signal-spezifischen Endpunkten** (für Backends, die nicht-standardisierte Pfade verwenden, z.B. `/api/otlp/traces` statt `/v1/traces`):

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

   > **Note:** Bei Verwendung des HTTP-Protokolls mit nur `otlpEndpoint` (ohne signal-spezifische Überschreibungen) hängt Qwen Code die Standard-OTLP-Pfade (`/v1/traces`, `/v1/logs`, `/v1/metrics`) an die Basis-URL an. Wenn Ihr Backend andere Pfade verwendet, nutzen Sie signal-spezifische Endpunkt-Überschreibungen wie in Option B gezeigt.

2. Wenn Ihr Alibaba Cloud-Endpunkt eine Authentifizierung erfordert, geben Sie OTLP-Header über die standardmäßigen OpenTelemetry-Umgebungsvariablen wie `OTEL_EXPORTER_OTLP_HEADERS` (oder die signal-spezifischen Varianten) an. Qwen Code bietet derzeit keine direkte Konfiguration von OTLP-Auth-Headern in `.qwen/settings.json`.

3. Führen Sie Qwen Code aus und senden Sie Prompts.

4. Zeigen Sie Telemetrie im Managed Service for OpenTelemetry an:
   - Produktübersicht:
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Erste Schritte:
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Console-Einstiegspunkte:
     - China-Festland:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (Legacy-Konsole:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - International:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - In der Console verwenden Sie `Applications`, um Traces und die Service-Topologie zu inspizieren.
   - Um den OTLP-Endpunkt und Zugriffsinformationen zu finden:
     - **Neue Konsole** (`trace.console.aliyun.com` oder international):
       navigieren Sie zu `Integration Center`.
     - **Legacy-Konsole** (`tracing.console.aliyun.com`): navigieren Sie zu
       `Cluster Configurations` → `Access point information`.

## Lokale Telemetrie

Für lokale Entwicklung und Debugging können Sie Telemetriedaten lokal erfassen:

### Dateibasierte Ausgabe (Empfohlen)

1. Aktivieren Sie Telemetrie in Ihrer `.qwen/settings.json`:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Note:** Wenn `outfile` gesetzt ist, wird der OTLP-Export automatisch deaktiviert.
   > Die Einstellungen `target` und `otlpEndpoint` werden für die reine Dateiausgabe nicht benötigt und können in Ihrer Konfiguration weggelassen werden.

2. Führen Sie Qwen Code aus und senden Sie Prompts.
3. Zeigen Sie Logs und Metriken in der angegebenen Datei an (z.B. `.qwen/telemetry.log`).

### Collector-basierter Export (Fortgeschritten)

1. Führen Sie das Automatisierungsskript aus:
   ```bash
   npm run telemetry -- --target=local
   ```
   Dies wird Folgendes tun:
   - Jaeger und den OTEL-Collector herunterladen und starten
   - Ihren Workspace für lokale Telemetrie konfigurieren
   - Eine Jaeger-Benutzeroberfläche unter http://localhost:16686 bereitstellen
   - Logs/Metriken in `~/.qwen/tmp/<projectHash>/otel/collector.log` speichern
   - Collector beim Beenden stoppen (z.B. `Strg+C`)
2. Führen Sie Qwen Code aus und senden Sie Prompts.
3. Zeigen Sie Traces unter http://localhost:16686 und Logs/Metriken in der Collector-Logdatei an.

## Logs und Metriken

Der folgende Abschnitt beschreibt die Struktur der für Qwen Code generierten Logs und Metriken.

- Eine `sessionId` ist als gemeinsames Attribut in allen Logs und Metriken enthalten.

### Logs

Logs sind mit Zeitstempeln versehene Aufzeichnungen spezifischer Ereignisse. Die folgenden Ereignisse werden für Qwen Code protokolliert:

- `qwen-code.config`: Dieses Ereignis tritt einmalig beim Start mit der Konfiguration der CLI auf.
  - **Attribute**:
    - `model` (String)
    - `sandbox_enabled` (Boolean)
    - `core_tools_enabled` (String)
    - `approval_mode` (String)
    - `file_filtering_respect_git_ignore` (Boolean)
    - `debug_mode` (Boolean)
    - `truncate_tool_output_threshold` (Number)
    - `truncate_tool_output_lines` (Number)
    - `hooks` (String, kommagetrennte Hook-Ereignistypen, ausgelassen wenn Hooks deaktiviert)
    - `ide_enabled` (Boolean)
    - `interactive_shell_enabled` (Boolean)
    - `mcp_servers` (String)
    - `output_format` (String: "text" oder "json")

- `qwen-code.user_prompt`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Prompt sendet.
  - **Attribute**:
    - `prompt_length` (Int)
    - `prompt_id` (String)
    - `prompt` (String, dieses Attribut wird ausgeschlossen, wenn `log_prompts_enabled` auf `false` gesetzt ist)
    - `auth_type` (String)

- `qwen-code.tool_call`: Dieses Ereignis tritt für jeden Funktionsaufruf auf.
  - **Attribute**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (Boolean)
    - `decision` (String: "accept", "reject", "auto_accept" oder "modify", falls zutreffend)
    - `error` (falls zutreffend)
    - `error_type` (falls zutreffend)
    - `content_length` (Int, falls zutreffend)
    - `metadata` (falls zutreffend, Dictionary von String -> any)

- `qwen-code.file_operation`: Dieses Ereignis tritt für jede Dateioperation auf.
  - **Attribute**:
    - `tool_name` (String)
    - `operation` (String: "create", "read", "update")
    - `lines` (Int, falls zutreffend)
    - `mimetype` (String, falls zutreffend)
    - `extension` (String, falls zutreffend)
    - `programming_language` (String, falls zutreffend)
    - `diff_stat` (JSON-String, falls zutreffend): Ein JSON-String mit folgenden Mitgliedern:
      - `ai_added_lines` (Int)
      - `ai_removed_lines` (Int)
      - `user_added_lines` (Int)
      - `user_removed_lines` (Int)

- `qwen-code.api_request`: Dieses Ereignis tritt beim Senden einer Anfrage an die Qwen-API auf.
  - **Attribute**:
    - `model`
    - `request_text` (falls zutreffend)

- `qwen-code.api_error`: Dieses Ereignis tritt auf, wenn die API-Anfrage fehlschlägt.
  - **Attribute**:
    - `model`
    - `error`
    - `error_type`
    - `status_code`
    - `duration_ms`
    - `auth_type`

- `qwen-code.api_response`: Dieses Ereignis tritt beim Erhalt einer Antwort von der Qwen-API auf.
  - **Attribute**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optional)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `response_text` (falls zutreffend)
    - `auth_type`

- `qwen-code.tool_output_truncated`: Dieses Ereignis tritt auf, wenn die Ausgabe eines Tool-Aufrufs zu groß ist und abgeschnitten wird.
  - **Attribute**:
    - `tool_name` (String)
    - `original_content_length` (Int)
    - `truncated_content_length` (Int)
    - `threshold` (Int)
    - `lines` (Int)
    - `prompt_id` (String)

- `qwen-code.malformed_json_response`: Dieses Ereignis tritt auf, wenn eine `generateJson`-Antwort der Qwen-API nicht als JSON geparst werden kann.
  - **Attribute**:
    - `model`

- `qwen-code.flash_fallback`: Dieses Ereignis tritt auf, wenn Qwen Code auf Flash als Fallback umschaltet.
  - **Attribute**:
    - `auth_type`

- `qwen-code.slash_command`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Slash-Befehl ausführt.
  - **Attribute**:
    - `command` (String)
    - `subcommand` (String, falls zutreffend)

- `qwen-code.extension_enable`: Dieses Ereignis tritt auf, wenn eine Erweiterung aktiviert wird.
- `qwen-code.extension_install`: Dieses Ereignis tritt auf, wenn eine Erweiterung installiert wird.
  - **Attribute**:
    - `extension_name` (String)
    - `extension_version` (String)
    - `extension_source` (String)
    - `status` (String)
- `qwen-code.extension_uninstall`: Dieses Ereignis tritt auf, wenn eine Erweiterung deinstalliert wird.

### Metriken

Metriken sind numerische Messungen des Verhaltens über die Zeit. Die folgenden Metriken werden für Qwen Code erfasst (Metriknamen bleiben aus Kompatibilitätsgründen `qwen-code.*`):

- `qwen-code.session.count` (Counter, Int): Wird bei jedem CLI-Start um eins erhöht.

- `qwen-code.tool.call.count` (Counter, Int): Zählt Tool-Aufrufe.
  - **Attribute**:
    - `function_name`
    - `success` (Boolean)
    - `decision` (String: "accept", "reject" oder "modify", falls zutreffend)
    - `tool_type` (String: "mcp" oder "native", falls zutreffend)

- `qwen-code.tool.call.latency` (Histogram, ms): Misst die Latenz von Tool-Aufrufen.
  - **Attribute**:
    - `function_name`
    - `decision` (String: "accept", "reject" oder "modify", falls zutreffend)

- `qwen-code.api.request.count` (Counter, Int): Zählt alle API-Anfragen.
  - **Attribute**:
    - `model`
    - `status_code`
    - `error_type` (falls zutreffend)

- `qwen-code.api.request.latency` (Histogram, ms): Misst die Latenz von API-Anfragen.
  - **Attribute**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): Zählt die Anzahl der verwendeten Tokens.
  - **Attribute**:
    - `model`
    - `type` (String: "input", "output", "thought" oder "cache")

- `qwen-code.file.operation.count` (Counter, Int): Zählt Dateioperationen.
  - **Attribute**:
    - `operation` (String: "create", "read", "update"): Der Typ der Dateioperation.
    - `lines` (Int, falls zutreffend): Anzahl der Zeilen in der Datei.
    - `mimetype` (String, falls zutreffend): Mimetype der Datei.
    - `extension` (String, falls zutreffend): Dateierweiterung der Datei.
    - `model_added_lines` (Int, falls zutreffend): Anzahl der vom Modell hinzugefügten/geänderten Zeilen.
    - `model_removed_lines` (Int, falls zutreffend): Anzahl der vom Modell entfernten/geänderten Zeilen.
    - `user_added_lines` (Int, falls zutreffend): Anzahl der vom Benutzer in KI-vorgeschlagenen Änderungen hinzugefügten/geänderten Zeilen.
    - `user_removed_lines` (Int, falls zutreffend): Anzahl der vom Benutzer in KI-vorgeschlagenen Änderungen entfernten/geänderten Zeilen.
    - `programming_language` (String, falls zutreffend): Die Programmiersprache der Datei.

- `qwen-code.chat_compression` (Counter, Int): Zählt Chat-Komprimierungsoperationen.
  - **Attribute**:
    - `tokens_before`: (Int): Anzahl der Tokens im Kontext vor der Komprimierung.
    - `tokens_after`: (Int): Anzahl der Tokens im Kontext nach der Komprimierung.