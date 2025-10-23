# Observability mit OpenTelemetry

Erfahre, wie du OpenTelemetry für Qwen Code aktivierst und einrichtest.

- [Observability mit OpenTelemetry](#observability-mit-opentelemetry)
  - [Hauptvorteile](#hauptvorteile)
  - [OpenTelemetry-Integration](#opentelemetry-integration)
  - [Konfiguration](#konfiguration)
  - [Google Cloud Telemetry](#google-cloud-telemetry)
    - [Voraussetzungen](#voraussetzungen)
    - [Direkter Export (Empfohlen)](#direkter-export-emfohlen)
    - [Collector-basierter Export (Fortgeschritten)](#collector-basierter-export-fortgeschritten)
  - [Lokale Telemetrie](#lokale-telemetrie)
    - [Dateibasierte Ausgabe (Empfohlen)](#dateibasierte-ausgabe-emfohlen)
    - [Collector-basierter Export (Fortgeschritten)](#collector-basierter-export-fortgeschritten-1)
  - [Logs und Metriken](#logs-und-metriken)
    - [Logs](#logs)
    - [Metriken](#metriken)

## Hauptvorteile

- **🔍 Usage Analytics**: Verstehe Interaktionsmuster und Feature-Adoption
  innerhalb deines Teams
- **⚡ Performance Monitoring**: Überwache Response-Zeiten, Token-Verbrauch und
  Ressourcennutzung
- **🐛 Echtzeit-Debugging**: Identifiziere Engpässe, Ausfälle und Fehlermuster
  sofort bei deren Auftreten
- **📊 Workflow-Optimierung**: Treffe fundierte Entscheidungen zur Verbesserung
  von Konfigurationen und Prozessen
- **🏢 Enterprise-Governance**: Überwache die Nutzung über Teams hinweg, verfolge Kosten, stelle Compliance sicher und integriere dich in bestehende Monitoring-Infrastruktur

## OpenTelemetry Integration

Basierend auf **[OpenTelemetry]** – dem herstellerneutralen, branchenweiten Standard für Observability – bietet Qwen Codes Observability-System:

- **Universelle Kompatibilität**: Exportiere zu jedem OpenTelemetry-Backend (Google Cloud, Jaeger, Prometheus, Datadog, etc.)
- **Standardisierte Daten**: Verwende konsistente Formate und Erfassungsmethoden in deiner Toolchain
- **Zukunftssichere Integration**: Verbinde dich mit bestehender und zukünftiger Observability-Infrastruktur
- **Kein Vendor Lock-in**: Wechsle zwischen Backends, ohne deine Instrumentierung ändern zu müssen

[OpenTelemetry]: https://opentelemetry.io/

## Konfiguration

Das gesamte Telemetrie-Verhalten wird über die Datei `.qwen/settings.json` gesteuert.  
Diese Einstellungen können durch Umgebungsvariablen oder CLI-Flags überschrieben werden.

| Einstellung    | Umgebungsvariable                | CLI-Flag                                                 | Beschreibung                                      | Werte             | Standard                |
| -------------- | -------------------------------- | -------------------------------------------------------- | ------------------------------------------------- | ----------------- | ----------------------- |
| `enabled`      | `GEMINI_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                         | Telemetrie aktivieren oder deaktivieren           | `true`/`false`    | `false`                 |
| `target`       | `GEMINI_TELEMETRY_TARGET`        | `--telemetry-target <local\|gcp>`                        | Ziel für Telemetriedaten                          | `"gcp"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `GEMINI_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                        | OTLP-Collector-Endpunkt                           | URL-String        | `http://localhost:4317` |
| `otlpProtocol` | `GEMINI_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                 | OTLP-Transport-Protokoll                          | `"grpc"`/`"http"` | `"grpc"`                |
| `outfile`      | `GEMINI_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                             | Telemetrie in Datei speichern (überschreibt `otlpEndpoint`) | Dateipfad         | -                       |
| `logPrompts`   | `GEMINI_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Prompts in Telemetrie-Logs einbeziehen            | `true`/`false`    | `true`                  |
| `useCollector` | `GEMINI_TELEMETRY_USE_COLLECTOR` | -                                                        | Externen OTLP-Collector verwenden (fortgeschritten) | `true`/`false`    | `false`                 |

**Hinweis zu booleschen Umgebungsvariablen:**  
Für die booleschen Einstellungen (`enabled`, `logPrompts`, `useCollector`) aktiviert das Setzen der entsprechenden Umgebungsvariable auf `true` oder `1` das Feature. Jeder andere Wert deaktiviert es.

Für detaillierte Informationen zu allen Konfigurationsoptionen, siehe [Konfigurationsanleitung](./cli/configuration.md).

## Google Cloud Telemetry

### Voraussetzungen

Bevor du eine der folgenden Methoden verwendest, führe diese Schritte aus:

1. Setze deine Google Cloud Project ID:
   - Für Telemetrie in einem separaten Projekt zur Inferenz:
     ```bash
     export OTLP_GOOGLE_CLOUD_PROJECT="your-telemetry-project-id"
     ```
   - Für Telemetrie im gleichen Projekt wie die Inferenz:
     ```bash
     export GOOGLE_CLOUD_PROJECT="your-project-id"
     ```

2. Authentifiziere dich bei Google Cloud:
   - Wenn du ein User-Account verwendest:
     ```bash
     gcloud auth application-default login
     ```
   - Wenn du einen Service Account verwendest:
     ```bash
     export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account.json"
     ```
3. Stelle sicher, dass dein Account oder Service Account über folgende IAM-Rollen verfügt:
   - Cloud Trace Agent
   - Monitoring Metric Writer
   - Logs Writer

4. Aktiviere die erforderlichen Google Cloud APIs (falls noch nicht aktiviert):
   ```bash
   gcloud services enable \
     cloudtrace.googleapis.com \
     monitoring.googleapis.com \
     logging.googleapis.com \
     --project="$OTLP_GOOGLE_CLOUD_PROJECT"
   ```

### Direct Export (Empfohlen)

Sendet Telemetriedaten direkt an Google Cloud Services. Kein Collector erforderlich.

1. Aktiviere Telemetrie in deiner `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp"
     }
   }
   ```
2. Starte Qwen Code und sende Prompts.
3. Zeige Logs und Metriken an:
   - Öffne die Google Cloud Console im Browser, nachdem du Prompts gesendet hast:
     - Logs: https://console.cloud.google.com/logs/
     - Metriken: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list

### Collector-basierte Exportfunktion (Fortgeschritten)

Für benutzerdefinierte Verarbeitung, Filterung oder Routing kannst du einen OpenTelemetry Collector verwenden, um die Daten an Google Cloud weiterzuleiten.

1. Konfiguriere deine `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "gcp",
       "useCollector": true
     }
   }
   ```
2. Führe das Automatisierungs-Skript aus:
   ```bash
   npm run telemetry -- --target=gcp
   ```
   Dies wird:
   - Einen lokalen OTEL Collector starten, der die Daten an Google Cloud weiterleitet
   - Deinen Workspace konfigurieren
   - Links bereitstellen, um Traces, Metriken und Logs in der Google Cloud Console anzusehen
   - Collector-Logs unter `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` speichern
   - Den Collector beim Beenden stoppen (z. B. mit `Ctrl+C`)
3. Starte Qwen Code und sende Prompts.
4. Logs und Metriken einsehen:
   - Öffne die Google Cloud Console im Browser, nachdem du Prompts gesendet hast:
     - Logs: https://console.cloud.google.com/logs/
     - Metriken: https://console.cloud.google.com/monitoring/metrics-explorer
     - Traces: https://console.cloud.google.com/traces/list
   - Öffne `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log`, um die lokalen Collector-Logs einzusehen.

## Lokale Telemetry

Für die lokale Entwicklung und das Debugging kannst du Telemetriedaten lokal erfassen:

### Dateibasierte Ausgabe (empfohlen)

1. Aktiviere Telemetry in deiner `.qwen/settings.json`:
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
3. Prüfe Logs und Metriken in der angegebenen Datei (z. B. `.qwen/telemetry.log`).

### Collector-basierte Exportfunktion (Fortgeschritten)

1. Führe das Automatisierungsskript aus:
   ```bash
   npm run telemetry -- --target=local
   ```
   Dies wird:
   - Jaeger und den OTEL Collector herunterladen und starten
   - Deinen Workspace für lokale Telemetrie konfigurieren
   - Ein Jaeger UI unter http://localhost:16686 bereitstellen
   - Logs/Metriken in `~/.qwen/tmp/<projectHash>/otel/collector.log` speichern
   - Den Collector beim Beenden stoppen (z.B. `Ctrl+C`)
2. Starte Qwen Code und sende Prompts.
3. Schaue dir die Traces unter http://localhost:16686 und die Logs/Metriken in der Collector-Logdatei an.

## Logs und Metriken

Der folgende Abschnitt beschreibt die Struktur der Logs und Metriken, die für Qwen Code generiert werden.

- Eine `sessionId` ist als gemeinsames Attribut in allen Logs und Metriken enthalten.

### Logs

Logs sind zeitgestempelte Aufzeichnungen spezifischer Ereignisse. Die folgenden Ereignisse werden für Qwen Code protokolliert:

- `qwen-code.config`: Dieses Ereignis tritt einmal beim Start mit der Konfiguration der CLI auf.
  - **Attribute**:
    - `model` (string)
    - `embedding_model` (string)
    - `sandbox_enabled` (boolean)
    - `core_tools_enabled` (string)
    - `approval_mode` (string)
    - `api_key_enabled` (boolean)
    - `vertex_ai_enabled` (boolean)
    - `code_assist_enabled` (boolean)
    - `log_prompts_enabled` (boolean)
    - `file_filtering_respect_git_ignore` (boolean)
    - `debug_mode` (boolean)
    - `mcp_servers` (string)
    - `output_format` (string: "text" oder "json")

- `qwen-code.user_prompt`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Prompt absendet.
  - **Attribute**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, dieses Attribut wird ausgeschlossen, wenn `log_prompts_enabled` auf `false` konfiguriert ist)
    - `auth_type` (string)

- `qwen-code.tool_call`: Dieses Ereignis tritt bei jedem Funktionsaufruf auf.
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

- `qwen-code.file_operation`: Dieses Ereignis tritt bei jeder Dateioperation auf.
  - **Attribute**:
    - `tool_name` (string)
    - `operation` (string: "create", "read", "update")
    - `lines` (int, falls zutreffend)
    - `mimetype` (string, falls zutreffend)
    - `extension` (string, falls zutreffend)
    - `programming_language` (string, falls zutreffend)
    - `diff_stat` (JSON-String, falls zutreffend): Ein JSON-String mit den folgenden Mitgliedern:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Dieses Ereignis tritt auf, wenn eine Anfrage an die Qwen API gesendet wird.
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

- `qwen-code.api_response`: Dieses Ereignis tritt auf, wenn eine Antwort von der Qwen API empfangen wird.
  - **Attribute**:
    - `model`
    - `status_code`
    - `duration_ms`
    - `error` (optional)
    - `input_token_count`
    - `output_token_count`
    - `cached_content_token_count`
    - `thoughts_token_count`
    - `tool_token_count`
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

- `qwen-code.flash_fallback`: Dieses Ereignis tritt auf, wenn Qwen Code auf Flash als Fallback wechselt.
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

Metriken sind numerische Messungen des Verhaltens über die Zeit. Für Qwen Code werden die folgenden Metriken gesammelt (die Metriknamen bleiben aus Kompatibilitätsgründen `qwen-code.*`):

- `qwen-code.session.count` (Counter, Int): Wird bei jedem CLI-Start um eins erhöht.

- `qwen-code.tool.call.count` (Counter, Int): Zählt die Tool-Aufrufe.
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
    - `type` (String: "input", "output", "thought", "cache" oder "tool")

- `qwen-code.file.operation.count` (Counter, Int): Zählt Dateioperationen.
  - **Attribute**:
    - `operation` (String: "create", "read", "update"): Der Typ der Dateioperation.
    - `lines` (Int, falls zutreffend): Anzahl der Zeilen in der Datei.
    - `mimetype` (String, falls zutreffend): MIME-Typ der Datei.
    - `extension` (String, falls zutreffend): Dateierweiterung.
    - `model_added_lines` (Int, falls zutreffend): Anzahl der vom Modell hinzugefügten/geänderten Zeilen.
    - `model_removed_lines` (Int, falls zutreffend): Anzahl der vom Modell entfernten/geänderten Zeilen.
    - `user_added_lines` (Int, falls zutreffend): Anzahl der vom Benutzer in den KI-vorgeschlagenen Änderungen hinzugefügten/geänderten Zeilen.
    - `user_removed_lines` (Int, falls zutreffend): Anzahl der vom Benutzer in den KI-vorgeschlagenen Änderungen entfernten/geänderten Zeilen.
    - `programming_language` (String, falls zutreffend): Die Programmiersprache der Datei.

- `qwen-code.chat_compression` (Counter, Int): Zählt Chat-Komprimierungsvorgänge.
  - **Attribute**:
    - `tokens_before` (Int): Anzahl der Tokens im Kontext vor der Komprimierung.
    - `tokens_after` (Int): Anzahl der Tokens im Kontext nach der Komprimierung.