# Beobachtbarkeit mit OpenTelemetry

Erfahren Sie, wie Sie OpenTelemetry für Qwen Code aktivieren und einrichten.

- [Beobachtbarkeit mit OpenTelemetry](#beobachtbarkeit-mit-opentelemetry)
  - [Wichtigste Vorteile](#wichtigste-vorteile)
  - [OpenTelemetry-Integration](#opentelemetry-integration)
  - [Konfiguration](#konfiguration)
  - [Aliyun Telemetry](#aliyun-telemetry)
    - [Manueller OTLP-Export](#manueller-otlp-export)
  - [Lokale Telemetrie](#lokale-telemetrie)
    - [Dateibasierte Ausgabe (Empfohlen)](#dateibasierte-ausgabe-empfohlen)
    - [Collector-basierter Export (Fortgeschritten)](#collector-basierter-export-fortgeschritten)
  - [Logs und Metriken](#logs-und-metriken)
    - [Logs](#logs)
    - [Metriken](#metriken)

## Wichtigste Vorteile

- **🔍 Nutzungsanalyse**: Verstehen Sie Interaktionsmuster und die Einführung von Funktionen in Ihrem Team.
- **⚡ Leistungsüberwachung**: Verfolgen Sie Antwortzeiten, Token-Verbrauch und Ressourcennutzung.
- **🐛 Echtzeit-Debugging**: Identifizieren Sie Engpässe, Fehler und Fehlermuster, sobald sie auftreten.
- **📊 Workflow-Optimierung**: Treffen Sie fundierte Entscheidungen zur Verbesserung von Konfigurationen und Prozessen.
- **🏢 Unternehmens-Governance**: Überwachen Sie die Nutzung teamsübergreifend, verfolgen Sie Kosten, stellen Sie Compliance sicher und integrieren Sie sich in die bestehende Überwachungsinfrastruktur.

## OpenTelemetry-Integration

Das Beobachtbarkeitssystem von Qwen Code basiert auf **[OpenTelemetry]** – dem anbieterneutralen, branchenüblichen Framework – und bietet:

- **Universelle Kompatibilität**: Export in jedes OpenTelemetry-Backend (Aliyun, Jaeger, Prometheus, Datadog, usw.).
- **Standardisierte Daten**: Verwenden Sie einheitliche Formate und Sammlungsmethoden in Ihrer gesamten Toolchain.
- **Zukunftssichere Integration**: Verbinden Sie sich mit bestehender und zukünftiger Beobachtbarkeitsinfrastruktur.
- **Keine Anbieterbindung**: Wechseln Sie zwischen Backends, ohne Ihre Instrumentierung ändern zu müssen.

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Konfiguration

Das gesamte Telemetrieverhalten wird über Ihre `.qwen/settings.json`-Datei gesteuert. Diese Einstellungen können durch Umgebungsvariablen oder CLI-Flags überschrieben werden.

| Einstellung                         | Umgebungsvariable                                        | CLI-Flag                                                 | Beschreibung                                                                                                                                                 | Werte             | Standard                |
| ----------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- | ----------------------- |
| `enabled`                           | `QWEN_TELEMETRY_ENABLED`                                 | `--telemetry` / `--no-telemetry`                         | Telemetrie aktivieren oder deaktivieren                                                                                                                      | `true`/`false`    | `false`                 |
| `target`                            | `QWEN_TELEMETRY_TARGET`                                  | `--telemetry-target <local\|gcp>` _(deprecated)_         | Informatives Ziel-Label; steuert nicht das Exporter-Routing – setzen Sie `otlpEndpoint` oder `outfile`, um festzulegen, wohin die Daten gesendet werden     | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint`                      | `QWEN_TELEMETRY_OTLP_ENDPOINT`                           | `--telemetry-otlp-endpoint <URL>`                        | OTLP-Collector-Endpunkt                                                                                                                                      | URL-String        | `http://localhost:4317` |
| `otlpProtocol`                      | `QWEN_TELEMETRY_OTLP_PROTOCOL`                           | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP-Transportprotokoll                                                                                                                                      | `"grpc"`/`"http"` | `"grpc"`                |
| `otlpTracesEndpoint`                | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`                    | -                                                        | Signal-spezifische Endpunkt-Überschreibung für Traces (nur HTTP)                                                                                             | URL-String        | -                       |
| `otlpLogsEndpoint`                  | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`                      | -                                                        | Signal-spezifische Endpunkt-Überschreibung für Logs (nur HTTP)                                                                                               | URL-String        | -                       |
| `otlpMetricsEndpoint`               | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`                   | -                                                        | Signal-spezifische Endpunkt-Überschreibung für Metriken (nur HTTP)                                                                                           | URL-String        | -                       |
| `outfile`                           | `QWEN_TELEMETRY_OUTFILE`                                 | `--telemetry-outfile <Pfad>`                             | Telemetrie in eine Datei speichern (überschreibt OTLP-Export)                                                                                                | Dateipfad         | -                       |
| `logPrompts`                        | `QWEN_TELEMETRY_LOG_PROMPTS`                             | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Prompts in Telemetrie-Logs aufnehmen                                                                                                                         | `true`/`false`    | `true`                  |
| `includeSensitiveSpanAttributes`    | `QWEN_TELEMETRY_INCLUDE_SENSITIVE_SPAN_ATTRIBUTES`       | -                                                        | Benutzer-Prompts, System-Prompts, Tool-I/O und Modellausgaben als native Span-Attribute aufnehmen (zusätzlich zu Log-to-Span-Bridge-Spans)                   | `true`/`false`    | `false`                 |
| `resourceAttributes`                | `OTEL_RESOURCE_ATTRIBUTES` (+ `OTEL_SERVICE_NAME`)       | -                                                        | Statische Ressourcen-Attribute, die an jeden exportierten Span/Log/Metric angehängt werden. Siehe [Ressourcen-Attribute](#ressourcen-attribute) unten.        | `key=value,…`     | `{}`                    |
| `metrics.includeSessionId`          | `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID`              | -                                                        | `session.id` auf Metrik-Datenpunkten aufnehmen. **Standardmäßig deaktiviert**, um Metrik-Backends vor Time-Series-Fan-Out zu schützen.                       | `true`/`false`    | `false`                 |
**Hinweis zu booleschen Umgebungsvariablen:** Bei den booleschen Einstellungen (`enabled`,
`logPrompts`, `includeSensitiveSpanAttributes`) wird die Funktion aktiviert, wenn die
entsprechende Umgebungsvariable auf `true` oder `1` gesetzt ist. Jeder
andere Wert deaktiviert sie.

**Sensitive Span-Attribute:** Wenn `includeSensitiveSpanAttributes` aktiviert ist,
passieren zwei Dinge:

1. **Native Span-Attribute (`qwen-code.interaction`, `api.generateContent*`,
   `tool.<name>`)** enthalten den wortgetreuen Gesprächsinhalt:
   - Benutzereingabeaufforderungen (`new_context`)
   - System-Prompts (`system_prompt` – vollständiger Text einmal pro Sitzung,
     dedupliziert per SHA-256-Hash; nachfolgende Spans enthalten nur
     `system_prompt_hash` + `system_prompt_preview` + `system_prompt_length`)
   - Tool-Schemata (als `tool_schema`-Ereignisse ausgegeben, ebenfalls hash-dedupliziert)
   - Tool-Eingaben (`tool_input`) und Tool-Ergebnisse (`tool_result`)
   - Modellausgabe (`response.model_output`)

   Jeder Wert wird auf 60 KB gekürzt; `*_truncated`- und `*_original_length`-Flags
   zeigen an, wenn eine Kürzung auftritt.

2. **Log-to-Span-Bridge-Spans** (verwendet, wenn HTTP-Traces ohne einen
   Logs-Endpunkt exportiert werden) behalten ihre vorhandenen Felder `prompt`,
   `function_args` und `response_text`, anstatt verworfen zu werden.

⚠️ **Sicherheitswarnung:** Wenn dieses Flag aktiviert ist, werden der vollständige Gesprächsverlauf,
von `read_file` gelesene Dateiinhalte, Shell-Befehle und deren Ausgabe (einschließlich
Geheimnisse in Umgebungsvariablen oder Argumenten) sowie Modellantworten an das konfigurierte OTLP-Backend
gestreamt. Behandeln Sie das Backend als privilegierte Daten-Senke. Das Flag
ist standardmäßig auf `false` gesetzt.

**Kosten / Nutzlastgröße:** Ein schwerer Turn (60 KB System-Prompt + 10 Tool-Aufrufe,
jeweils bis zu 60 KB Eingabe + 60 KB Ergebnis, plus 60 KB Modellausgabe) kann bis zu
~1,5 MB Attribut-Nutzlast vor OTLP-Kompression erzeugen. Wenn Tools, die große Dateien
lesen (`read_file`, usw.), auf langlebige Sitzungen verweisen, überwachen Sie den
Exporter-Durchsatz.

Diese Einstellung deaktiviert keine sensiblen Daten in OTel-Logs oder anderen Telemetrie-Senken;
Nicht-interne API-Antwort-Telemetrie kann `response_text` füllen, daher
können OTel-Logs, UI-Telemetrie und Chat-Aufzeichnungen Antworttexte unabhängig von dieser
Einstellung erhalten. QwenLogger enthält kein `response_text`.

**HTTP-OTLP-Signal-Routing:** Bei Verwendung des HTTP-Protokolls (`otlpProtocol: "http"`)
hängt Qwen Code automatisch signalspezifische Pfade (`/v1/traces`, `/v1/logs`,
`/v1/metrics`) an die Basis-`otlpEndpoint` an. Beispielsweise wird
`http://collector:4318` zu `http://collector:4318/v1/traces` für Traces. Wenn die URL
bereits auf einen Signal-Pfad endet, wird sie unverändert verwendet. Signalspezifische
Endpunkt-Überschreibungen (`otlpTracesEndpoint` usw.) haben Vorrang vor dem Basis-Endpunkt
und werden wörtlich verwendet. Das gRPC-Protokoll verwendet servicebasiertes Routing und hängt keine
Pfade an.

Die Umgebungsvariablen für signalspezifische Endpunkte akzeptieren auch die
Standard-OpenTelemetry-Namen: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.
Die `QWEN_TELEMETRY_OTLP_*`-Varianten haben Vorrang vor den `OTEL_*`-Varianten.

Ausführliche Informationen zu allen Konfigurationsoptionen finden Sie im
[Konfigurationshandbuch](../../users/configuration/settings.md).

### Ressourcenattribute

Ressourcenattribute sind statische Schlüssel-Wert-Paare, die an jeden Span, Log
und jede Metrik angehängt werden, die über OTLP exportiert wird. Verwenden Sie sie, um
Telemetrie nach Team, Umgebung, Bereitstellungsregion oder jeder anderen Dimension zu
segmentieren, die Ihr Backend wichtig ist.

Zwei Quellen, zusammengeführt in Prioritätsreihenfolge (niedrigste → höchste):

1. Die Standard-Umgebungsvariable `OTEL_RESOURCE_ATTRIBUTES`
2. `telemetry.resourceAttributes` in `.qwen/settings.json` (überschreibt die Umgebungsvariable bei
   Schlüsselkonflikt)

`OTEL_SERVICE_NAME` ist eine separate Ausweichmöglichkeit – wenn gesetzt, überschreibt es
`service.name` aus jeder anderen Quelle (gemäß der OpenTelemetry-Spezifikation).

#### Beispiele

**Telemetrie nach Team / Umgebung segmentieren:**

```bash
export OTEL_RESOURCE_ATTRIBUTES="team=platform,env=prod,cost_center=eng-123"
```

**An einen mandantenspezifischen Collector über `service.name` weiterleiten:**

```bash
export OTEL_SERVICE_NAME=qwen-code-ci
```

**Basislinie für den gesamten Pool (`~/.qwen/settings.json`) + Übersteuerung pro Host:**

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
# Ein einmaliges Tag hinzufügen, ohne die Einstellungen zu ändern:
export OTEL_RESOURCE_ATTRIBUTES="debug_run=true"
```

#### Reservierte Schlüssel

Einige Schlüssel werden zur Laufzeit gesteuert und können nicht überschrieben werden:

- `service.version` – immer auf die laufende CLI-Version gesetzt. Das Setzen aus einer
  beliebigen Quelle wird stillschweigend mit einer Warnung verworfen.
- `session.id` – zur Laufzeit pro Sitzung eingefügt. Vom Benutzer bereitgestellte Werte aus
  Umgebungsvariablen oder Einstellungen werden mit einer Warnung verworfen. Der Grund ist,
  dass Ressourcenattribute automatisch an jeden Metrikdatenpunkt angehängt werden; eine
  Überschreibung durch den Benutzer würde die unten stehenden [Kardinalitätskontrollen](#cardinality-controls)
  umgehen. Spans und Logs enthalten immer `session.id`.

`service.name` ist **nicht** reserviert; es folgt der oben genannten Prioritätskette.

#### Format

`OTEL_RESOURCE_ATTRIBUTES` folgt der OpenTelemetry-Spezifikation:
`key1=value1,key2=value2` mit Prozent-codierten Werten. Leerzeichen in Werten müssen
als `%20` codiert werden, **Kommas als `%2C`** (unkodierte Kommas teilen den Wert an der
falschen Grenze und die zweite Hälfte wird als fehlerhaft verworfen). Fehlerhafte
Paare werden mit einer Warnung übersprungen, anstatt dass die Telemetrie-Initialisierung fehlschlägt.
#### Fehlerbehebung: Wenn ein benutzerdefiniertes Attribut scheinbar keine Wirkung zeigt

Reservierte Schlüssel (`service.version`, `session.id`), fehlerhafte Paare, Nicht-String-Einstellungswerte und ungültige Prozentcodierung werden alle stillschweigend verworfen, wobei eine Warnung über den OpenTelemetry-Diagnosekanal protokolliert wird. Dieser Kanal leitet in die Debug-Logdatei (`~/.qwen/log/otel-*.log`), **nicht** in die Konsole, sodass das Verhalten wie ein stiller Fehlschlag aussehen kann.

Wenn ein benutzerdefiniertes Ressourcenattribut in der exportierten Telemetrie nicht erscheint:

1. Überprüfen Sie `~/.qwen/log/otel-*.log` auf Zeilen, die `cannot override` (reservierter Schlüssel verworfen), `Skipping malformed` (fehlerhafte Umgebungsvariablen-Paare) oder `must be a string` (Nicht-String-Einstellungswerte) enthalten.
2. Stellen Sie sicher, dass die Umgebungsvariable in der Umgebung des qwen-code-Prozesses gesetzt ist (nicht nur in Ihrer Shell) und dass die Werte prozentcodiert sind.
3. Bestätigen Sie, dass `telemetry.enabled` auf `true` gesetzt ist – die Telemetrieinitialisierung läuft nur, wenn sie aktiviert ist.

### Kardinalitätskontrollen

Metriken werden vom Backend nach Attributsatz aggregiert – jede eindeutige Kombination von Attributwerten erzeugt eine neue Zeitreihe. Das Hinzufügen eines hochkardinalen Feldes wie `session.id` zu einer Metrik führt zu einer Zeitreihen-Aufspaltung proportional zur Anzahl der Sitzungen, was schnell den Speicher des Metrik-Backends erschöpft.

Um dies zu verhindern, behält Qwen Code standardmäßig hochkardinale Attribute von Metrikdatenpunkten fern. Spans und Logs sind ereignisbasiert und nicht betroffen, sodass sie weiterhin `session.id` für die Trace- und Log-Korrelation tragen.

#### `telemetry.metrics.includeSessionId` (Standard: `false`)

Das Setzen auf `true` (über Einstellungen oder `QWEN_TELEMETRY_METRICS_INCLUDE_SESSION_ID=true`) fügt `session.id` wieder an jeden Metrikdatenpunkt an.

⚠️ **Warnung:** Jede CLI-Sitzung erzeugt einen neuen Wert. Wenn diese Einstellung für eine gesamte Flotte aktiviert bleibt, wird der Metrikspeicher gesprengt. Nur für kurzfristige Fehlersuche empfohlen. Für die langfristige Sitzungskorrelation fragen Sie stattdessen Trace- oder Log-Backends ab.

#### Migration von früheren Versionen

Vor dieser Version war `session.id` standardmäßig an Metriken angehängt. Falls Ihre Prometheus-Abfragen / Grafana-Dashboards / Alarmregeln auf `session_id` in einer Metrik verweisen, haben Sie zwei Optionen:

**Option A** – Wiederherstellung des vorherigen Verhaltens für kurzfristige Fehlersuche:

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

**Option B (empfohlen)** – Verlagerung der sitzungsbezogenen Analyse aus den Metriken. Spans und Logs enthalten weiterhin `session.id`, und Trace-/Log-Backends (Jaeger, Tempo, Loki, Aliyun SLS / ARMS Tracing) unterstützen nativ die sitzungsbezogene Aufteilung ohne Kardinalitätsdruck.

### Client-seitiger HTTP-Span bei ausgehenden fetch-Aufrufen

Wenn Telemetrie aktiviert ist, registriert Qwen Code `UndiciInstrumentation`, das einen client-seitigen HTTP-Span für jede ausgehende `fetch()`-Anfrage erstellt, die vom Prozess initiiert wird – einschließlich der LLM-SDKs (`openai`, `@google/genai`, `@anthropic-ai/sdk`), des MCP StreamableHTTP-Clients, des `WebFetch`-Tools und aller IDE-Erweiterungs-Aufrufe außerhalb des Prozesses. Der Span ermöglicht es, die Netzwerklatenz (TTFB / Antwortkörper-Übertragung) getrennt von der Verarbeitungszeit des vorgelagerten Modells zu sehen, was der vorhandene `api.generateContent`-Span allein nicht unterscheiden kann.

Diese Spans gehen an Ihren **eigenen** OTLP-Collector (oder Datei-Ausgabe) genau wie die restliche Telemetrie – sie beeinflussen nicht, was in die ausgehende HTTP-Anfrage selbst geschrieben wird. Ob der W3C `traceparent`-Header ebenfalls in den ausgehenden Anfragestrom geschrieben wird, wird durch eine **separate, sicherheitsrelevante Einstellung** gesteuert, die weiter unten in [Ausgehende Korrelation (sicherheitsrelevant)](#outbound-correlation-security-relevant) dokumentiert ist.

**Rückkopplungsschleifen-Vermeidung.** Das OTel SDK verwendet `fetch` intern zum Hochladen von OTLP-Daten. Ohne Schutz würde die Instrumentierung von `fetch` diese Uploads verfolgen, die wiederum hochgeladen würden, was eine Endlosschleife verursacht. Die Undici-Instrumentierung von Qwen Code ist mit einem `ignoreRequestHook` konfiguriert, der URLs überspringt, die mit den konfigurierten `telemetry.otlpEndpoint` / `telemetry.otlpTracesEndpoint` / `telemetry.otlpLogsEndpoint` / `telemetry.otlpMetricsEndpoint`-Präfixen übereinstimmen. Im Datei-Ausgabe-Modus gibt es keine ausgehenden HTTP-Uploads, daher ist der Hook wirkungslos.

## Ausgehende Korrelation (SICHERHEITSRELEVANT)

Diese Einstellungen befinden sich absichtlich in einem **separaten Namespace auf oberster Ebene** von `telemetry.*`: Telemetrie steuert den Datenfluss in das eigene Observability-Backend des Betreibers, während `outboundCorrelation.*` steuert, welche client-seitigen Korrelationsdaten qwen-code **in ausgehende LLM-API-Anforderungsströme schreibt**, die Drittanbieter-LLM-Endpunkte erreichen (DashScope, OpenAI, Anthropic, usw.). Unterschiedliche Empfänger, unterschiedliche Zustimmungsentscheidung. **Alle Werte sind standardmäßig deaktiviert.** Siehe PR #4390 Review-Diskussion für die Begründung des Framings.

### `outboundCorrelation.propagateTraceContext`

```jsonc
"outboundCorrelation": {
  "propagateTraceContext": false // Standard
}
```

Wenn `false` (Standard), installiert Qwen Code einen No-op-`TextMapPropagator` im OTel SDK. UndiciInstrumentation erstellt weiterhin client-seitige HTTP-Spans für Ihren OTLP-Collector, aber `propagation.inject()` ist ein No-op, sodass **kein `traceparent` auf ausgehende Anfragen geschrieben wird**. Trace-IDs bleiben intern im Collector des Betreibers.
Wenn `true` gesetzt ist, wird der standardmäßige W3C Composite Propagator des SDKs (`tracecontext` + `baggage`) installiert und der standardmäßige `traceparent`-Header wird bei jedem ausgehenden `fetch` geschrieben:

```
traceparent: 00-<32-hex traceId>-<16-hex parentSpanId>-<01-sampled | 00-not-sampled>
```

Aktivieren Sie dies nur, wenn der LLM-Anbieter ebenfalls in Ihren OTel-Collector meldet, um eine prozessübergreifende Trace-Verkettung zu ermöglichen – z. B. ARMS Tracing für DashScope. Für die meisten Betreiber ist der Wert `false`; die Trace-Weiterleitung über verschiedene Anbieter hinweg ist eine Nischenfunktion.

**Erfordert `telemetry.enabled: true`.** Das OTel-SDK wird nur initialisiert, wenn Telemetrie aktiviert ist, daher wirkt `propagateTraceContext` nur in diesem Zustand. Bei `true` bei deaktivierter Telemetrie passiert still nichts – kein SDK, kein Propagator, kein `traceparent` auf der Leitung. Überprüfen Sie beide Flags, wenn Sie eine ARMS+DashScope-Korrelation einrichten:

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

### Weitere ausgehende Korrelations-Header

`X-Qwen-Code-Session-Id` und `X-Qwen-Code-Request-Id` sind **nicht Teil dieses PRs**. Sie werden in einem eigenen Folge-PR unter demselben Namespace `outboundCorrelation.*` entwickelt und vorgeschlagen, jeweils mit eigenem Bedrohungsmodell und Betreiber-Zustimmungsverfahren. Das Review von PR #4390 (LaZzyMan) legte das Prinzip fest: „Der Aufgabenbereich der Telemetrie umfasst nicht das Senden von Identifikatoren an LLM-Anbieter“; die Arbeit an Korrelations-Headern wird in eine eigene Design-Diskussion verschoben, anstatt unter Telemetrie zu landen.

## Aliyun Telemetrie

### Manueller OTLP-Export

Um Qwen-Code-Telemetrie im Alibaba Cloud Managed Service for OpenTelemetry anzuzeigen, konfigurieren Sie Qwen Code so, dass es an den von ARMS bereitgestellten OTLP-Endpunkt exportiert.

Allein die Angabe von `"target": "gcp"` konfiguriert das Exportziel nicht. Wenn `otlpEndpoint` nicht gesetzt ist, verwendet Qwen Code weiterhin den Standardwert `http://localhost:4317`. Wenn `outfile` gesetzt ist, überschreibt dies `otlpEndpoint` und die Telemetrie wird in die Datei geschrieben, anstatt an Alibaba Cloud gesendet zu werden.

1. Aktivieren Sie die Telemetrie in Ihrer `.qwen/settings.json` und setzen Sie den OTLP-Endpunkt:

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

   **Option B: HTTP-Protokoll mit signal-spezifischen Endpunkten** (für Backends, die nicht standardmäßige Pfade verwenden, z. B. `/api/otlp/traces` statt `/v1/traces`):

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

   > **Hinweis:** Bei Verwendung des HTTP-Protokolls mit nur `otlpEndpoint` (ohne signal-spezifische Überschreibungen) hängt Qwen Code die Standard-OTLP-Pfade (`/v1/traces`, `/v1/logs`, `/v1/metrics`) an die Basis-URL an. Wenn Ihr Backend andere Pfade verwendet, verwenden Sie signal-spezifische Endpunkt-Überschreibungen wie in Option B gezeigt.

2. Wenn Ihr Alibaba-Cloud-Endpunkt eine Authentifizierung erfordert, geben Sie OTLP-Header über Standard-OpenTelemetry-Umgebungsvariablen wie `OTEL_EXPORTER_OTLP_HEADERS` (oder die signal-spezifischen Varianten) an. Qwen Code bietet derzeit keine direkte Möglichkeit, OTLP-Auth-Header in `.qwen/settings.json` zu setzen.
3. Führen Sie Qwen Code aus und senden Sie Prompts.
4. Zeigen Sie die Telemetrie im Managed Service for OpenTelemetry an:
   - Produktübersicht:
     [Was ist Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Erste Schritte:
     [Erste Schritte mit Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Einstiegspunkte in die Konsole:
     - Festlandchina:
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (Legacy-Konsole:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - International:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - Verwenden Sie in der Konsole die Option `Applications`, um Traces und Service-Topologie zu untersuchen.
   - So finden Sie den OTLP-Endpunkt und die Zugangsinformationen:
     - **Neue Konsole** (`trace.console.aliyun.com` oder international):
       navigieren Sie zu `Integration Center`.
     - **Legacy-Konsole** (`tracing.console.aliyun.com`): navigieren Sie zu
       `Cluster Configurations` → `Access point information`.

## Lokale Telemetrie

Für lokale Entwicklung und Debugging können Sie Telemetriedaten lokal erfassen:

### Dateibasierte Ausgabe (Empfohlen)

1. Aktivieren Sie die Telemetrie in Ihrer `.qwen/settings.json`:

   ```json
   {
     "telemetry": {
       "enabled": true,
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```

   > **Hinweis:** Wenn `outfile` gesetzt ist, wird der OTLP-Export automatisch deaktiviert.
   > Die Einstellungen `target` und `otlpEndpoint` werden für die reine Dateiausgabe nicht benötigt und können bedenkenlos aus Ihrer Konfiguration weggelassen werden.

2. Führen Sie Qwen Code aus und senden Sie Prompts.
3. Zeigen Sie Logs und Metriken in der angegebenen Datei an (z. B. `.qwen/telemetry.log`).
### Collector-basierter Export (Erweitert)

1. Führen Sie das Automatisierungsskript aus:
   ```bash
   npm run telemetry -- --target=local
   ```
   Dies wird folgendes bewirken:
   - Jaeger und den OTEL-Collector herunterladen und starten
   - Ihren Workspace für lokale Telemetrie konfigurieren
   - Eine Jaeger-UI unter http://localhost:16686 bereitstellen
   - Logs/Metriken unter `~/.qwen/tmp/<projectHash>/otel/collector.log` speichern
   - Den Collector beim Beenden stoppen (z.B. `Ctrl+C`)
2. Führen Sie Qwen Code aus und senden Sie Prompts.
3. Zeigen Sie Traces unter http://localhost:16686 und Logs/Metriken in der Collector-Logdatei an.

## Logs und Metriken

Der folgende Abschnitt beschreibt die Struktur der Logs und Metriken, die für Qwen Code generiert werden.

- Eine `sessionId` wird als gemeinsames Attribut in allen Logs und Metriken eingefügt.

### Logs

Logs sind mit Zeitstempel versehene Aufzeichnungen bestimmter Ereignisse. Die folgenden Ereignisse werden für Qwen Code protokolliert:

- `qwen-code.config`: Dieses Ereignis tritt einmalig beim Start mit der Konfiguration der CLI auf.
  - **Attribute**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, kommagetrennte Hook-Ereignistypen, ausgelassen wenn Hooks deaktiviert)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" oder "json")

- `qwen-code.user_prompt`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Prompt einreicht.
  - **Attribute**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, dieses Attribut wird ausgeschlossen, wenn `log_prompts_enabled` auf `false` gesetzt ist)
    - `auth_type` (string)

- `qwen-code.tool_call`: Dieses Ereignis tritt für jeden Funktionsaufruf auf.
  - **Attribute**:
    - `function_name`
    - `function_args`
    - `duration_ms`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", "auto_accept" oder "modify", falls zutreffend)
    - `error` (falls zutreffend)
    - `error_type` (falls zutreffend)
    - `content_length` (int, falls zutreffend)
    - `metadata` (falls zutreffend, Wörterbuch von string -> any)

- `qwen-code.file_operation`: Dieses Ereignis tritt für jede Dateioperation auf.
  - **Attribute**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, falls zutreffend)
    - `mimetype` (string, falls zutreffend)
    - `extension` (string, falls zutreffend)
    - `programming_language` (string, falls zutreffend)
    - `diff_stat` (json-string, falls zutreffend): Ein JSON-String mit den folgenden Mitgliedern:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Dieses Ereignis tritt bei einer Anfrage an die Qwen-API auf.
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

- `qwen-code.api_response`: Dieses Ereignis tritt beim Eintreffen einer Antwort von der Qwen-API auf.
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
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: Dieses Ereignis tritt auf, wenn eine `generateJson`-Antwort der Qwen-API nicht als JSON geparst werden kann.
  - **Attribute**:
    - `model`

- `qwen-code.flash_fallback`: Dieses Ereignis tritt auf, wenn Qwen Code als Fallback auf Flash umschaltet.
  - **Attribute**:
    - `auth_type`

- `qwen-code.slash_command`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Slash-Befehl ausführt.
  - **Attribute**:
    - `command` (string)
    - `subcommand` (string, falls zutreffend)

- `qwen-code.extension_enable`: Dieses Ereignis tritt auf, wenn eine Erweiterung aktiviert wird.
- `qwen-code.extension_install`: Dieses Ereignis tritt auf, wenn eine Erweiterung installiert wird.
  - **Attribute**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: Dieses Ereignis tritt auf, wenn eine Erweiterung deinstalliert wird.

### Metriken

Metriken sind numerische Messungen des Verhaltens im Zeitverlauf. Die folgenden Metriken werden für Qwen Code erfasst (Metriknamen bleiben aus Kompatibilitätsgründen `qwen-code.*`):

- `qwen-code.session.count` (Counter, Int): Wird einmal pro CLI-Start erhöht.

- `qwen-code.tool.call.count` (Counter, Int): Zählt Tool-Aufrufe.
  - **Attribute**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject" oder "modify", falls zutreffend)
    - `tool_type` (string: "mcp" oder "native", falls zutreffend)
- `qwen-code.tool.call.latency` (Histogram, ms): Misst die Latenz von Tool-Aufrufen.
  - **Attribute**:
    - `function_name`
    - `decision` (string: "accept", "reject" oder "modify", falls zutreffend)

- `qwen-code.api.request.count` (Counter, Int): Zählt alle API-Anfragen.
  - **Attribute**:
    - `model`
    - `status_code`
    - `error_type` (falls zutreffend)

- `qwen-code.api.request.latency` (Histogram, ms): Misst die Latenz von API-Anfragen.
  - **Attribute**:
    - `model`

- `qwen-code.token.usage` (Counter, Int): Zählt die Anzahl der verwendeten Token.
  - **Attribute**:
    - `model`
    - `type` (string: "input", "output", "thought" oder "cache")

- `qwen-code.file.operation.count` (Counter, Int): Zählt Dateioperationen.
  - **Attribute**:
    - `operation` (string: "create", "read", "update"): Der Typ der Dateioperation.
    - `lines` (Int, falls zutreffend): Anzahl der Zeilen in der Datei.
    - `mimetype` (string, falls zutreffend): MIME-Typ der Datei.
    - `extension` (string, falls zutreffend): Dateierweiterung der Datei.
    - `model_added_lines` (Int, falls zutreffend): Anzahl der vom Modell hinzugefügten/geänderten Zeilen.
    - `model_removed_lines` (Int, falls zutreffend): Anzahl der vom Modell entfernten/geänderten Zeilen.
    - `user_added_lines` (Int, falls zutreffend): Anzahl der vom Benutzer in KI-vorgeschlagenen Änderungen hinzugefügten/geänderten Zeilen.
    - `user_removed_lines` (Int, falls zutreffend): Anzahl der vom Benutzer in KI-vorgeschlagenen Änderungen entfernten/geänderten Zeilen.
    - `programming_language` (string, falls zutreffend): Die Programmiersprache der Datei.

- `qwen-code.chat_compression` (Counter, Int): Zählt Chat-Komprimierungsvorgänge
  - **Attribute**:
    - `tokens_before`: (Int): Anzahl der Token im Kontext vor der Komprimierung
    - `tokens_after`: (Int): Anzahl der Token im Kontext nach der Komprimierung
