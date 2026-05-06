# Observability mit OpenTelemetry

Erfahre, wie du OpenTelemetry für Qwen Code aktivierst und einrichtest.

- [Observability mit OpenTelemetry](#observability-with-opentelemetry)
  - [Wichtige Vorteile](#key-benefits)
  - [OpenTelemetry-Integration](#opentelemetry-integration)
  - [Konfiguration](#configuration)
  - [Aliyun-Telemetrie](#aliyun-telemetry)
    - [Manueller OTLP-Export](#manual-otlp-export)
  - [Lokale Telemetrie](#local-telemetry)
    - [Dateibasierte Ausgabe (Empfohlen)](#file-based-output-recommended)
    - [Collector-basierter Export (Fortgeschritten)](#collector-based-export-advanced)
  - [Logs und Metriken](#logs-and-metrics)
    - [Logs](#logs)
    - [Metriken](#metrics)

## Wichtige Vorteile

- **🔍 Nutzungsanalysen**: Verstehe Interaktionsmuster und die Feature-Nutzung
  in deinem Team
- **⚡ Performance-Monitoring**: Überwache Antwortzeiten, Token-Verbrauch und
  Ressourcennutzung
- **🐛 Echtzeit-Debugging**: Identifiziere Engpässe, Fehler und Fehlermuster,
  sobald sie auftreten
- **📊 Workflow-Optimierung**: Triff fundierte Entscheidungen zur Verbesserung
  von Konfigurationen und Prozessen
- **🏢 Enterprise-Governance**: Überwache die Nutzung über Teams hinweg, verfolge Kosten, stelle Compliance sicher und integriere dich in bestehende Monitoring-Infrastruktur

## OpenTelemetry-Integration

Basierend auf **[OpenTelemetry]** – dem herstellerneutralen, branchenüblichen
Observability-Framework – bietet das Observability-System von Qwen Code:

- **Universelle Kompatibilität**: Export zu jedem OpenTelemetry-Backend (Aliyun,
  Jaeger, Prometheus, Datadog usw.)
- **Standardisierte Daten**: Nutze konsistente Formate und Sammlungsmethoden in
  deiner Toolchain
- **Zukunftssichere Integration**: Verbinde dich mit bestehender und zukünftiger Observability-Infrastruktur
- **Kein Vendor Lock-in**: Wechsle zwischen Backends, ohne deine
  Instrumentierung zu ändern

[OpenTelemetry]: https://opentelemetry.io/
[aliyun-opentelemetry-overview]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/product-overview/what-is-tracing-analysis
[aliyun-opentelemetry-get-started]: https://www.alibabacloud.com/help/en/arms/tracing-analysis/before-you-begin
[aliyun-opentelemetry-console-cn]: https://trace.console.aliyun.com
[aliyun-opentelemetry-console-cn-legacy]: https://tracing.console.aliyun.com
[aliyun-opentelemetry-console-intl]: https://arms.console.alibabacloud.com

## Konfiguration

> [!note]
>
> **⚠️ Wichtiger Hinweis: Dieses Feature erfordert entsprechende Code-Änderungen. Diese Dokumentation wird vorab bereitgestellt; bitte beziehe dich für die tatsächliche Funktionalität auf zukünftige Code-Updates.**

Das gesamte Telemetrie-Verhalten wird über deine `.qwen/settings.json`-Datei gesteuert.
Diese Einstellungen können durch Umgebungsvariablen oder CLI-Flags überschrieben werden.

| Einstellung             | Umgebungsvariable                        | CLI-Flag                                                 | Beschreibung                                           | Werte             | Standardwert              |
| ----------------------- | ---------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ | ----------------- | ------------------------- |
| `enabled`               | `QWEN_TELEMETRY_ENABLED`                 | `--telemetry` / `--no-telemetry`                         | Telemetrie aktivieren oder deaktivieren                | `true`/`false`    | `false`                   |
| `target`                | `QWEN_TELEMETRY_TARGET`                  | `--telemetry-target <local\|gcp>`                        | Ziel für Telemetriedaten                               | `"gcp"`/`"local"` | `"local"`                 |
| `otlpEndpoint`          | `QWEN_TELEMETRY_OTLP_ENDPOINT`           | `--telemetry-otlp-endpoint <URL>`                        | Endpunkt des OTLP-Collectors                           | URL-String        | `http://localhost:4317`   |
| `otlpProtocol`          | `QWEN_TELEMETRY_OTLP_PROTOCOL`           | `--telemetry-otlp-protocol <grpc\|http>`                 | Transportprotokoll für OTLP                            | `"grpc"`/`"http"` | `"grpc"`                  |
| `otlpTracesEndpoint`    | `QWEN_TELEMETRY_OTLP_TRACES_ENDPOINT`    | -                                                        | Signal-spezifischer Endpunkt-Override für Traces (nur HTTP)  | URL-String        | -                         |
| `otlpLogsEndpoint`      | `QWEN_TELEMETRY_OTLP_LOGS_ENDPOINT`      | -                                                        | Signal-spezifischer Endpunkt-Override für Logs (nur HTTP)    | URL-String        | -                         |
| `otlpMetricsEndpoint`   | `QWEN_TELEMETRY_OTLP_METRICS_ENDPOINT`   | -                                                        | Signal-spezifischer Endpunkt-Override für Metriken (nur HTTP) | URL-String        | -                         |
| `outfile`               | `QWEN_TELEMETRY_OUTFILE`                 | `--telemetry-outfile <path>`                             | Telemetrie in Datei speichern (überschreibt `otlpEndpoint`)    | Dateipfad         | -                         |
| `logPrompts`            | `QWEN_TELEMETRY_LOG_PROMPTS`             | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Prompts in Telemetrie-Logs einschließen                | `true`/`false`    | `true`                    |
| `useCollector`          | `QWEN_TELEMETRY_USE_COLLECTOR`           | -                                                        | Externen OTLP-Collector verwenden (fortgeschritten)    | `true`/`false`    | `false`                   |

**Hinweis zu booleschen Umgebungsvariablen:** Für die booleschen Einstellungen (`enabled`,
`logPrompts`, `useCollector`) aktiviert das Setzen der entsprechenden Umgebungsvariable auf
`true` oder `1` das Feature. Jeder andere Wert deaktiviert es.

**HTTP-OTLP-Signal-Routing:** Bei Verwendung des HTTP-Protokolls (`otlpProtocol: "http"`)
hängt Qwen Code automatisch signal-spezifische Pfade (`/v1/traces`, `/v1/logs`,
`/v1/metrics`) an den Basis-`otlpEndpoint` an. Beispielsweise wird `http://collector:4318`
für Traces zu `http://collector:4318/v1/traces`. Wenn die URL bereits mit einem Signalpfad endet, wird sie unverändert verwendet. Signal-spezifische Endpunkt-Overrides
(`otlpTracesEndpoint` usw.) haben Vorrang vor dem Basis-Endpunkt und werden wortwörtlich übernommen. Das gRPC-Protokoll verwendet servicebasiertes Routing und hängt keine Pfade an.

Die signal-spezifischen Endpunkt-Umgebungsvariablen akzeptieren auch die standardmäßigen
OpenTelemetry-Namen: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT`,
`OTEL_EXPORTER_OTLP_LOGS_ENDPOINT`, `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`.
Die `QWEN_TELEMETRY_OTLP_*`-Varianten haben Vorrang vor den `OTEL_*`-Varianten.

Detaillierte Informationen zu allen Konfigurationsoptionen findest du im
[Konfigurationsleitfaden](./cli/configuration.md).

## Aliyun-Telemetrie

### Manueller OTLP-Export

Um die Qwen Code-Telemetrie im Alibaba Cloud Managed Service for
OpenTelemetry anzuzeigen, konfiguriere Qwen Code so, dass es zum von ARMS bereitgestellten OTLP-Endpunkt exportiert.

Das alleinige Setzen von `"target": "gcp"` konfiguriert nicht das Exportziel. Wenn `otlpEndpoint` nicht gesetzt ist, verwendet Qwen Code standardmäßig weiterhin
`http://localhost:4317`. Wenn `outfile` gesetzt ist, überschreibt es
`otlpEndpoint` und die Telemetrie wird in die Datei geschrieben, anstatt an Alibaba Cloud gesendet zu werden.

1. Aktiviere die Telemetrie in deiner `.qwen/settings.json` und setze den OTLP-Endpunkt:

   **Option A: gRPC-Protokoll** (standardmäßiger OTLP-Endpunkt):

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

   **Option B: HTTP-Protokoll mit signal-spezifischen Endpunkten** (für Backends,
   die nicht-standardmäßige Pfade verwenden, z. B. `/api/otlp/traces` statt `/v1/traces`):

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

   > **Hinweis:** Bei Verwendung des HTTP-Protokolls mit nur `otlpEndpoint` (ohne
   > signal-spezifische Overrides) hängt Qwen Code standardmäßige OTLP-Pfade
   > (`/v1/traces`, `/v1/logs`, `/v1/metrics`) an die Basis-URL an. Wenn dein
   > Backend andere Pfade verwendet, nutze signal-spezifische Endpunkt-Overrides wie
   > in Option B gezeigt.

2. Wenn dein Alibaba Cloud-Endpunkt Authentifizierung erfordert, übergib OTLP-Header über standardmäßige OpenTelemetry-Umgebungsvariablen wie
   `OTEL_EXPORTER_OTLP_HEADERS` (oder die signal-spezifischen Varianten). Qwen
   Code macht OTLP-Auth-Header derzeit nicht direkt in
   `.qwen/settings.json` verfügbar.
3. Starte Qwen Code und sende Prompts.
4. Zeige die Telemetrie im Managed Service for OpenTelemetry an:
   - Produktübersicht:
     [What is Managed Service for OpenTelemetry?][aliyun-opentelemetry-overview]
   - Erste Schritte:
     [Get started with Managed Service for OpenTelemetry][aliyun-opentelemetry-get-started]
   - Konsoleneinstiegspunkte:
     - China (Festland):
       [trace.console.aliyun.com][aliyun-opentelemetry-console-cn]
       (Legacy-Konsole:
       [tracing.console.aliyun.com][aliyun-opentelemetry-console-cn-legacy])
     - International:
       [arms.console.alibabacloud.com][aliyun-opentelemetry-console-intl]
   - Verwende in der Konsole `Applications`, um Traces und die Service-Topologie zu inspizieren.
   - So findest du den OTLP-Endpunkt und die Zugriffsinformationen:
     - **Neue Konsole** (`trace.console.aliyun.com` oder international):
       navigiere zu `Integration Center`.
     - **Legacy-Konsole** (`tracing.console.aliyun.com`): navigiere zu
       `Cluster Configurations` → `Access point information`.

## Lokale Telemetrie

Für die lokale Entwicklung und das Debugging kannst du Telemetriedaten lokal erfassen:

### Dateibasierte Ausgabe (Empfohlen)

1. Aktiviere die Telemetrie in deiner `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "local",
       "otlpEndpoint": "",
       "outfile": ".qwen/telemetry.log"
     }
   }
   ```
2. Starte Qwen Code und sende Prompts.
3. Zeige Logs und Metriken in der angegebenen Datei an (z. B. `.qwen/telemetry.log`).

### Collector-basierter Export (Fortgeschritten)

1. Führe das Automationsskript aus:
   ```bash
   npm run telemetry -- --target=local
   ```
   Dies führt Folgendes aus:
   - Download und Start von Jaeger und OTEL-Collector
   - Konfiguration deines Workspaces für lokale Telemetrie
   - Bereitstellung einer Jaeger-UI unter http://localhost:16686
   - Speichern von Logs/Metriken in `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Stoppen des Collectors beim Beenden (z. B. `Ctrl+C`)
2. Starte Qwen Code und sende Prompts.
3. Zeige Traces unter http://localhost:16686 und Logs/Metriken in der Collector-Logdatei an.

## Logs und Metriken

Der folgende Abschnitt beschreibt die Struktur der für Qwen Code generierten Logs und Metriken.

- Ein `sessionId` wird als gemeinsames Attribut in allen Logs und Metriken enthalten.

### Logs

Logs sind zeitgestempelte Aufzeichnungen spezifischer Ereignisse. Für Qwen Code werden folgende Ereignisse geloggt:

- `qwen-code.config`: Dieses Ereignis tritt einmal beim Start mit der CLI-Konfiguration auf.
  - **Attribute**:
    - `model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `truncate_tool_output_threshold` (number)
    - `truncate_tool_output_lines` (number)
    - `hooks` (string, durch Kommas getrennte Hook-Ereignistypen, entfällt wenn Hooks deaktiviert sind)
    - `ide_enabled` (boolean)
    - `interactive_shell_enabled` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" oder "json")

- `qwen-code.user_prompt`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Prompt sendet.
  - **Attribute**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, dieses Attribut wird ausgeschlossen, wenn `log_prompts_enabled` auf `false` konfiguriert ist)
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
    - `metadata` (falls zutreffend, Dictionary von string -> any)

- `qwen-code.file_operation`: Dieses Ereignis tritt für jede Dateioperation auf.
  - **Attribute**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, falls zutreffend)
    - `mimetype` (string, falls zutreffend)
    - `extension` (string, falls zutreffend)
    - `programming_language` (string, falls zutreffend)
    - `diff_stat` (JSON-String, falls zutreffend): Ein JSON-String mit folgenden Mitgliedern:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Dieses Ereignis tritt beim Senden einer Anfrage an die Qwen API auf.
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

- `qwen-code.api_response`: Dieses Ereignis tritt beim Empfang einer Antwort von der Qwen API auf.
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

- `qwen-code.tool_output_truncated`: Dieses Ereignis tritt auf, wenn die Ausgabe eines Tool-Aufrufs zu groß ist und gekürzt wird.
  - **Attribute**:
    - `tool_name` (string)
    - `original_content_length` (int)
    - `truncated_content_length` (int)
    - `threshold` (int)
    - `lines` (int)
    - `prompt_id` (string)

- `qwen-code.malformed_json_response`: Dieses Ereignis tritt auf, wenn eine `generateJson`-Antwort von der Qwen API nicht als JSON geparst werden kann.
  - **Attribute**:
    - `model`

- `qwen-code.flash_fallback`: Dieses Ereignis tritt auf, wenn Qwen Code als Fallback auf Flash wechselt.
  - **Attribute**:
    - `auth_type`

- `qwen-code.slash_command`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Slash-Befehl ausführt.
  - **Attribute**:
    - `command` (string)
    - `subcommand` (string, falls zutreffend)

- `qwen-code.extension_enable`: Dieses Ereignis tritt auf, wenn eine Erweiterung aktiviert wird
- `qwen-code.extension_install`: Dieses Ereignis tritt auf, wenn eine Erweiterung installiert wird
  - **Attribute**:
    - `extension_name` (string)
    - `extension_version` (string)
    - `extension_source` (string)
    - `status` (string)
- `qwen-code.extension_uninstall`: Dieses Ereignis tritt auf, wenn eine Erweiterung deinstalliert wird

### Metriken

Metriken sind numerische Messwerte des Verhaltens über die Zeit. Für Qwen Code werden folgende Metriken erfasst (Metriknamen bleiben aus Kompatibilitätsgründen `qwen-code.*`):

- `qwen-code.session.count` (Counter, Int): Wird einmal pro CLI-Start inkrementiert.

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

- `qwen-code.token.usage` (Counter, Int): Zählt die Anzahl der verwendeten Tokens.
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
    - `tokens_before`: (Int): Anzahl der Tokens im Kontext vor der Komprimierung
    - `tokens_after`: (Int): Anzahl der Tokens im Kontext nach der Komprimierung