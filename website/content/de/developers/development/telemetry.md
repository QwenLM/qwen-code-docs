# Observability mit OpenTelemetry

Erfahren Sie, wie Sie OpenTelemetry für Qwen Code aktivieren und einrichten.

- [Observability mit OpenTelemetry](#observability-mit-opentelemetry)
  - [Hauptvorteile](#hauptvorteile)
  - [OpenTelemetry-Integration](#opentelemetry-integration)
  - [Konfiguration](#konfiguration)
  - [Aliyun Telemetrie](#aliyun-telemetrie)
    - [Voraussetzungen](#voraussetzungen)
    - [Direkter Export (Empfohlen)](#direkter-export-emfohlen)
  - [Lokale Telemetrie](#lokale-telemetrie)
    - [Dateibasierte Ausgabe (Empfohlen)](#dateibasierte-ausgabe-emfohlen)
    - [Collector-basierter Export (Erweitert)](#collector-basierter-export-erweitert)
  - [Logs und Metriken](#logs-und-metriken)
    - [Logs](#logs)
    - [Metriken](#metriken)

## Hauptvorteile

- **🔍 Nutzungsanalysen**: Verstehen Sie Interaktionsmuster und die Nutzung von Funktionen
  innerhalb Ihres Teams
- **⚡ Leistungsüberwachung**: Verfolgen Sie Antwortzeiten, Tokenverbrauch und
  Ressourcennutzung
- **🐛 Echtzeit-Debugging**: Identifizieren Sie Engpässe, Ausfälle und Fehlermuster,
  sobald sie auftreten
- **📊 Workflow-Optimierung**: Treffen Sie fundierte Entscheidungen zur Verbesserung
  von Konfigurationen und Prozessen
- **🏢 Unternehmensgovernance**: Überwachen Sie die Nutzung über Teams hinweg, verfolgen Sie Kosten, stellen Sie die Einhaltung sicher und integrieren Sie bestehende Überwachungsinfrastruktur

## OpenTelemetry-Integration

Basierend auf **[OpenTelemetry]** – dem herstellerneutralen, branchenweiten Standard für Observability – bietet das Observability-System von Qwen Code:

- **Universelle Kompatibilität**: Export zu jedem OpenTelemetry-Backend (Aliyun, Jaeger, Prometheus, Datadog usw.)
- **Standardisierte Daten**: Verwendung konsistenter Formate und Erfassungsmethoden in der gesamten Toolchain
- **Zukunftssichere Integration**: Verbindung mit bestehender und zukünftiger Observability-Infrastruktur
- **Keine Herstellerabhängigkeit**: Wechsel zwischen Backends ohne Änderung der Instrumentierung

[OpenTelemetry]: https://opentelemetry.io/

## Konfiguration

> [!note]
>
> **⚠️ Besonderer Hinweis: Diese Funktion erfordert entsprechende Codeänderungen. Diese Dokumentation wird vorab bereitgestellt; für die tatsächliche Funktionalität sei auf zukünftige Code-Updates verwiesen.**

Das gesamte Telemetrieverhalten wird über Ihre `.qwen/settings.json`-Datei gesteuert.
Diese Einstellungen können durch Umgebungsvariablen oder CLI-Flags überschrieben werden.

| Einstellung    | Umgebungsvariable              | CLI-Flag                                                | Beschreibung                                      | Werte              | Standard                |
| -------------- | ------------------------------ | ------------------------------------------------------- | ------------------------------------------------- | ------------------ | ----------------------- |
| `enabled`      | `QWEN_TELEMETRY_ENABLED`       | `--telemetry` / `--no-telemetry`                        | Telemetrie aktivieren oder deaktivieren           | `true`/`false`     | `false`                 |
| `target`       | `QWEN_TELEMETRY_TARGET`        | `--telemetry-target <local\|qwen>`                      | Ziel für das Senden von Telemetriedaten           | `"qwen"`/`"local"` | `"local"`               |
| `otlpEndpoint` | `QWEN_TELEMETRY_OTLP_ENDPOINT` | `--telemetry-otlp-endpoint <URL>`                       | OTLP-Collector-Endpunkt                           | URL-String         | `http://localhost:4317` |
| `otlpProtocol` | `QWEN_TELEMETRY_OTLP_PROTOCOL` | `--telemetry-otlp-protocol <grpc\|http>`                | OTLP-Transportprotokoll                           | `"grpc"`/`"http"`  | `"grpc"`                |
| `outfile`      | `QWEN_TELEMETRY_OUTFILE`       | `--telemetry-outfile <path>`                            | Speichern von Telemetriedaten in Datei (überschreibt `otlpEndpoint`) | Dateipfad          | -                       |
| `logPrompts`   | `QWEN_TELEMETRY_LOG_PROMPTS`   | `--telemetry-log-prompts` / `--no-telemetry-log-prompts` | Prompts in Telemetrielogs einbeziehen             | `true`/`false`     | `true`                  |
| `useCollector` | `QWEN_TELEMETRY_USE_COLLECTOR` | -                                                       | Externen OTLP-Collector verwenden (fortgeschritten) | `true`/`false`     | `false`                 |

**Hinweis zu booleschen Umgebungsvariablen:** Bei den booleschen Einstellungen (`enabled`,
`logPrompts`, `useCollector`) aktiviert das Setzen der entsprechenden Umgebungsvariablen auf
`true` oder `1` die Funktion. Jeder andere Wert deaktiviert sie.

Für detaillierte Informationen zu allen Konfigurationsoptionen, siehe
[Konfigurationsanleitung](./cli/configuration.md).

## Aliyun Telemetrie

### Direkter Export (Empfohlen)

Sendet Telemetriedaten direkt an Aliyun-Dienste. Kein Collector erforderlich.

1. Aktiviere die Telemetrie in deiner `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Führe Qwen Code aus und sende Prompts.
3. Zeige Logs und Metriken in der Aliyun-Konsole an.

## Lokale Telemetrie

Für lokale Entwicklung und Debugging kannst du Telemetriedaten lokal erfassen:

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
2. Führe Qwen Code aus und sende Prompts.
3. Zeige Logs und Metriken in der angegebenen Datei an (z. B. `.qwen/telemetry.log`).

### Collector-basierte Exportfunktion (Erweitert)

1. Führen Sie das Automatisierungsskript aus:
   ```bash
   npm run telemetry -- --target=local
   ```
   Dies wird:
   - Jaeger und den OTEL-Collector herunterladen und starten
   - Ihren Workspace für lokale Telemetrie konfigurieren
   - Eine Jaeger-Benutzeroberfläche unter http://localhost:16686 bereitstellen
   - Protokolle/Metriken in `~/.qwen/tmp/<projectHash>/otel/collector.log` speichern
   - Den Collector beim Beenden stoppen (z. B. `Strg+C`)
2. Starten Sie Qwen Code und senden Sie Eingabeaufforderungen.
3. Sehen Sie sich die Traces unter http://localhost:16686 und die Protokolle/Metriken in der Collector-Protokolldatei an.

## Protokolle und Metriken

Der folgende Abschnitt beschreibt die Struktur der für Qwen Code generierten Protokolle und Metriken.

- Eine `sessionId` ist als gemeinsames Attribut in allen Protokollen und Metriken enthalten.

### Logs

Logs sind zeitgestempelte Aufzeichnungen spezifischer Ereignisse. Die folgenden Ereignisse werden für Qwen Code protokolliert:

- `qwen-code.config`: Dieses Ereignis tritt einmal beim Start mit der CLI-Konfiguration auf.
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

- `qwen-code.user_prompt`: Dieses Ereignis tritt auf, wenn ein Benutzer eine Eingabeaufforderung sendet.
  - **Attribute**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, dieses Attribut wird ausgeschlossen, wenn `log_prompts_enabled` 
      auf `false` konfiguriert ist)
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
    - `diff_stat` (JSON-String, falls zutreffend): Ein JSON-String mit den folgenden Elementen:
      - `ai_added_lines` (int)
      - `ai_removed_lines` (int)
      - `user_added_lines` (int)
      - `user_removed_lines` (int)

- `qwen-code.api_request`: Dieses Ereignis tritt auf, wenn eine Anfrage an die Qwen-API gesendet wird.
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

- `qwen-code.api_response`: Dieses Ereignis tritt auf, wenn eine Antwort von der Qwen-API empfangen wird.
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

- `qwen-code.malformed_json_response`: Dieses Ereignis tritt auf, wenn eine `generateJson`-Antwort von der Qwen-API nicht als JSON geparst werden kann.
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

Metriken sind numerische Messungen des Verhaltens über die Zeit. Die folgenden Metriken werden für Qwen Code gesammelt (Metriknamen bleiben aus Kompatibilitätsgründen `qwen-code.*`):

- `qwen-code.session.count` (Zähler, Integer): Wird einmal pro CLI-Start erhöht.

- `qwen-code.tool.call.count` (Zähler, Integer): Zählt Tool-Aufrufe.
  - **Attribute**:
    - `function_name`
    - `success` (Boolean)
    - `decision` (String: "accept", "reject" oder "modify", falls zutreffend)
    - `tool_type` (String: "mcp" oder "native", falls zutreffend)

- `qwen-code.tool.call.latency` (Histogramm, ms): Misst die Latenz von Tool-Aufrufen.
  - **Attribute**:
    - `function_name`
    - `decision` (String: "accept", "reject" oder "modify", falls zutreffend)

- `qwen-code.api.request.count` (Zähler, Integer): Zählt alle API-Anfragen.
  - **Attribute**:
    - `model`
    - `status_code`
    - `error_type` (falls zutreffend)

- `qwen-code.api.request.latency` (Histogramm, ms): Misst die Latenz von API-Anfragen.
  - **Attribute**:
    - `model`

- `qwen-code.token.usage` (Zähler, Integer): Zählt die Anzahl der verwendeten Tokens.
  - **Attribute**:
    - `model`
    - `type` (String: "input", "output", "thought", "cache" oder "tool")

- `qwen-code.file.operation.count` (Zähler, Integer): Zählt Dateioperationen.
  - **Attribute**:
    - `operation` (String: "create", "read", "update"): Der Typ der Dateioperation.
    - `lines` (Integer, falls zutreffend): Anzahl der Zeilen in der Datei.
    - `mimetype` (String, falls zutreffend): MIME-Typ der Datei.
    - `extension` (String, falls zutreffend): Dateierweiterung der Datei.
    - `model_added_lines` (Integer, falls zutreffend): Anzahl der vom Modell hinzugefügten/geänderten Zeilen.
    - `model_removed_lines` (Integer, falls zutreffend): Anzahl der vom Modell entfernten/geänderten Zeilen.
    - `user_added_lines` (Integer, falls zutreffend): Anzahl der vom Benutzer in vorgeschlagenen Änderungen hinzugefügten/geänderten Zeilen.
    - `user_removed_lines` (Integer, falls zutreffend): Anzahl der vom Benutzer in vorgeschlagenen Änderungen entfernten/geänderten Zeilen.
    - `programming_language` (String, falls zutreffend): Die Programmiersprache der Datei.

- `qwen-code.chat_compression` (Zähler, Integer): Zählt Chat-Komprimierungsvorgänge.
  - **Attribute**:
    - `tokens_before` (Integer): Anzahl der Tokens im Kontext vor der Komprimierung.
    - `tokens_after` (Integer): Anzahl der Tokens im Kontext nach der Komprimierung.