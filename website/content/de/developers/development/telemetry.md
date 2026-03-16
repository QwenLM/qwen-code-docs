# Observability mit OpenTelemetry

Erfahren Sie, wie Sie OpenTelemetry für Qwen Code aktivieren und einrichten.

- [Observability mit OpenTelemetry](#observability-mit-opentelemetry)
  - [Wesentliche Vorteile](#wesentliche-vorteile)
  - [OpenTelemetry-Integration](#opentelemetry-integration)
  - [Konfiguration](#konfiguration)
  - [Aliyun-Telemetrie](#aliyun-telemetrie)
    - [Voraussetzungen](#voraussetzungen)
    - [Direkter Export (empfohlen)](#direkter-export-empfohlen)
  - [Lokale Telemetrie](#lokale-telemetrie)
    - [Dateibasierter Export (empfohlen)](#dateibasierter-export-empfohlen)
    - [Export über Collector (fortgeschritten)](#export-über-collector-fortgeschritten)
  - [Protokolle und Metriken](#protokolle-und-metriken)
    - [Protokolle](#protokolle)
    - [Metriken](#metriken)

## Wichtige Vorteile

- **🔍 Nutzungsanalyse**: Verstehen Sie Interaktionsmuster und die Einführung neuer Funktionen innerhalb Ihres Teams.
- **⚡ Leistungsüberwachung**: Verfolgen Sie Antwortzeiten, Token-Verbrauch und Ressourcenauslastung.
- **🐛 Echtzeit-Debugging**: Identifizieren Sie Engpässe, Fehler und Fehlermuster, sobald sie auftreten.
- **📊 Workflow-Optimierung**: Treffen Sie fundierte Entscheidungen zur Verbesserung von Konfigurationen und Prozessen.
- **🏢 Unternehmensweite Governance**: Überwachen Sie die Nutzung über verschiedene Teams hinweg, verfolgen Sie Kosten, stellen Sie die Einhaltung von Vorschriften sicher und integrieren Sie die Lösung in Ihre bestehende Monitoring-Infrastruktur.

## OpenTelemetry-Integration

Aufbauend auf **[OpenTelemetry]** – dem herstellerunabhängigen, branchenweiten Standard-Framework für Observability – bietet das Observability-System von Qwen Code:

- **Universelle Kompatibilität**: Export in jedes OpenTelemetry-Backend (Aliyun, Jaeger, Prometheus, Datadog usw.)
- **Standardisierte Daten**: Verwendung einheitlicher Formate und Sammlungsmethoden über Ihre gesamte Toolchain hinweg
- **Zukunftssichere Integration**: Anbindung an bestehende und zukünftige Observability-Infrastrukturen
- **Keine Vendor-Lock-in**: Wechsel zwischen Backends ohne Änderung Ihrer Instrumentierung

[OpenTelemetry]: https://opentelemetry.io/

## Konfiguration

> [!note]
>
> **⚠️ Besonderer Hinweis: Diese Funktion erfordert entsprechende Codeänderungen. Diese Dokumentation wird vorab bereitgestellt; für die tatsächliche Funktionalität beachten Sie bitte zukünftige Codeaktualisierungen.**

Das gesamte Telemetrie-Verhalten wird über Ihre Datei `.qwen/settings.json` gesteuert.  
Diese Einstellungen können durch Umgebungsvariablen oder CLI-Flags überschrieben werden.

| Einstellung        | Umgebungsvariable                 | CLI-Flag                                                  | Beschreibung                                          | Mögliche Werte         | Standardwert          |
| ------------------ | ----------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ---------------------- | --------------------- |
| `enabled`          | `QWEN_TELEMETRY_ENABLED`          | `--telemetry` / `--no-telemetry`                          | Aktiviert oder deaktiviert die Telemetrie             | `true`/`false`         | `false`               |
| `target`           | `QWEN_TELEMETRY_TARGET`           | `--telemetry-target <local\|qwen>`                       | Zielort für die Übertragung der Telemetriedaten       | `"qwen"`/`"local"`     | `"local"`             |
| `otlpEndpoint`     | `QWEN_TELEMETRY_OTLP_ENDPOINT`    | `--telemetry-otlp-endpoint <URL>`                         | OTLP-Collector-Endpunkt                               | URL-Zeichenkette       | `http://localhost:4317` |
| `otlpProtocol`     | `QWEN_TELEMETRY_OTLP_PROTOCOL`    | `--telemetry-otlp-protocol <grpc\|http>`                  | OTLP-Transportprotokoll                               | `"grpc"`/`"http"`      | `"grpc"`              |
| `outfile`          | `QWEN_TELEMETRY_OUTFILE`          | `--telemetry-outfile <Pfad>`                              | Speichert Telemetriedaten in einer Datei (ersetzt `otlpEndpoint`) | Dateipfad              | –                     |
| `logPrompts`       | `QWEN_TELEMETRY_LOG_PROMPTS`      | `--telemetry-log-prompts` / `--no-telemetry-log-prompts`  | Schließt Prompts in die Telemetrielogs ein            | `true`/`false`         | `true`                |
| `useCollector`     | `QWEN_TELEMETRY_USE_COLLECTOR`    | –                                                         | Verwendet einen externen OTLP-Collector (erweitert)   | `true`/`false`         | `false`               |

**Hinweis zu booleschen Umgebungsvariablen:** Bei den booleschen Einstellungen (`enabled`, `logPrompts`, `useCollector`) aktiviert der Wert `true` oder `1` für die entsprechende Umgebungsvariable die Funktion. Jeder andere Wert deaktiviert sie.

Für detaillierte Informationen zu allen Konfigurationsoptionen siehe die  
[Konfigurationsanleitung](./cli/configuration.md).

## Aliyun-Telemetrie

### Direkter Export (empfohlen)

Sendet Telemetriedaten direkt an Aliyun-Dienste. Kein Collector erforderlich.

1. Aktivieren Sie die Telemetrie in Ihrer Datei `.qwen/settings.json`:
   ```json
   {
     "telemetry": {
       "enabled": true,
       "target": "qwen"
     }
   }
   ```
2. Führen Sie Qwen Code aus und senden Sie Prompts.
3. Zeigen Sie Protokolle und Metriken in der Aliyun-Konsole an.

## Lokale Telemetrie

Für lokale Entwicklung und Debugging können Sie Telemetriedaten lokal erfassen:

### Ausgabe in einer Datei (empfohlen)

1. Aktivieren Sie die Telemetrie in Ihrer Datei `.qwen/settings.json`:
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
2. Führen Sie Qwen Code aus und senden Sie Prompts.
3. Zeigen Sie Protokolle und Metriken in der angegebenen Datei an (z. B. `.qwen/telemetry.log`).

### Export basierend auf Collector (erweitert)

1. Führen Sie das Automatisierungsskript aus:
   ```bash
   npm run telemetry -- --target=local
   ```
   Dadurch wird Folgendes ausgeführt:
   - Herunterladen und Starten von Jaeger und dem OTEL-Collector
   - Konfigurieren Ihres Arbeitsbereichs für lokale Telemetrie
   - Bereitstellen einer Jaeger-Benutzeroberfläche unter http://localhost:16686
   - Speichern von Logs und Metriken in `~/.qwen/tmp/<projectHash>/otel/collector.log`
   - Beenden des Collectors beim Beenden (z. B. mit `Strg+C`)
2. Starten Sie Qwen Code und senden Sie Eingabeaufforderungen.
3. Zeigen Sie die Traces unter http://localhost:16686 sowie Logs und Metriken in der Collector-Logdatei an.

## Logs und Metriken

Der folgende Abschnitt beschreibt die Struktur der Logs und Metriken, die für Qwen Code generiert werden.

- Eine `sessionId` wird als gemeinsames Attribut in allen Logs und Metriken enthalten.

### Protokolle

Protokolle sind Zeitstempel-aufgezeichnete Aufzeichnungen bestimmter Ereignisse. Die folgenden Ereignisse werden für Qwen Code protokolliert:

- `qwen-code.config`: Dieses Ereignis tritt einmal beim Start mit der CLI-Konfiguration auf.  
  - **Attribute**:  
    - `model` (Zeichenkette)  
    - `sandbox_enabled` (boolesch)  
    - `core_tools_enabled` (Zeichenkette)  
    - `approval_mode` (Zeichenkette)  
    - `file_filtering_respect_git_ignore` (boolesch)  
    - `debug_mode` (boolesch)  
    - `truncate_tool_output_threshold` (Zahl)  
    - `truncate_tool_output_lines` (Zahl)  
    - `hooks` (Zeichenkette, durch Kommas getrennte Hook-Ereignistypen; wird ausgelassen, falls Hooks deaktiviert sind)  
    - `ide_enabled` (boolesch)  
    - `interactive_shell_enabled` (boolesch)  
    - `mcp_servers` (Zeichenkette)  
    - `output_format` (Zeichenkette: „text“ oder „json“)  

- `qwen-code.user_prompt`: Dieses Ereignis tritt auf, wenn ein Benutzer eine Eingabeaufforderung (Prompt) sendet.  
  - **Attribute**:  
    - `prompt_length` (ganze Zahl)  
    - `prompt_id` (Zeichenkette)  
    - `prompt` (Zeichenkette; dieses Attribut wird ausgelassen, falls `log_prompts_enabled` auf `false` konfiguriert ist)  
    - `auth_type` (Zeichenkette)  

- `qwen-code.tool_call`: Dieses Ereignis tritt für jeden Funktionsaufruf auf.  
  - **Attribute**:  
    - `function_name`  
    - `function_args`  
    - `duration_ms`  
    - `success` (boolesch)  
    - `decision` (Zeichenkette: „accept“, „reject“, „auto_accept“ oder „modify“, falls zutreffend)  
    - `error` (falls zutreffend)  
    - `error_type` (falls zutreffend)  
    - `content_length` (ganze Zahl, falls zutreffend)  
    - `metadata` (falls zutreffend; Wörterbuch aus Zeichenkette → beliebiger Typ)  

- `qwen-code.file_operation`: Dieses Ereignis tritt für jede Dateioperation auf.  
  - **Attribute**:  
    - `tool_name` (Zeichenkette)  
    - `operation` (Zeichenkette: „create“, „read“, „update“)  
    - `lines` (ganze Zahl, falls zutreffend)  
    - `mimetype` (Zeichenkette, falls zutreffend)  
    - `extension` (Zeichenkette, falls zutreffend)  
    - `programming_language` (Zeichenkette, falls zutreffend)  
    - `diff_stat` (JSON-Zeichenkette, falls zutreffend): Eine JSON-Zeichenkette mit folgenden Feldern:  
      - `ai_added_lines` (ganze Zahl)  
      - `ai_removed_lines` (ganze Zahl)  
      - `user_added_lines` (ganze Zahl)  
      - `user_removed_lines` (ganze Zahl)  

- `qwen-code.api_request`: Dieses Ereignis tritt beim Senden einer Anfrage an die Qwen-API auf.  
  - **Attribute**:  
    - `model`  
    - `request_text` (falls zutreffend)  

- `qwen-code.api_error`: Dieses Ereignis tritt auf, falls die API-Anfrage fehlschlägt.  
  - **Attribute**:  
    - `model`  
    - `error`  
    - `error_type`  
    - `status_code`  
    - `duration_ms`  
    - `auth_type`  

- `qwen-code.api_response`: Dieses Ereignis tritt beim Empfang einer Antwort von der Qwen-API auf.  
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

- `qwen-code.tool_output_truncated`: Dieses Ereignis tritt auf, wenn die Ausgabe eines Tool-Aufrufs zu groß ist und daher gekürzt wird.  
  - **Attribute**:  
    - `tool_name` (Zeichenkette)  
    - `original_content_length` (ganze Zahl)  
    - `truncated_content_length` (ganze Zahl)  
    - `threshold` (ganze Zahl)  
    - `lines` (ganze Zahl)  
    - `prompt_id` (Zeichenkette)  

- `qwen-code.malformed_json_response`: Dieses Ereignis tritt auf, wenn eine `generateJson`-Antwort der Qwen-API nicht als JSON geparst werden kann.  
  - **Attribute**:  
    - `model`  

- `qwen-code.flash_fallback`: Dieses Ereignis tritt auf, wenn Qwen Code als Fallback auf Flash umschaltet.  
  - **Attribute**:  
    - `auth_type`  

- `qwen-code.slash_command`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Slash-Befehl ausführt.  
  - **Attribute**:  
    - `command` (Zeichenkette)  
    - `subcommand` (Zeichenkette, falls zutreffend)  

- `qwen-code.extension_enable`: Dieses Ereignis tritt auf, wenn eine Erweiterung aktiviert wird.  
- `qwen-code.extension_install`: Dieses Ereignis tritt auf, wenn eine Erweiterung installiert wird.  
  - **Attribute**:  
    - `extension_name` (Zeichenkette)  
    - `extension_version` (Zeichenkette)  
    - `extension_source` (Zeichenkette)  
    - `status` (Zeichenkette)  
- `qwen-code.extension_uninstall`: Dieses Ereignis tritt auf, wenn eine Erweiterung deinstalliert wird.

### Metriken

Metriken sind numerische Messungen des Verhaltens über die Zeit. Die folgenden Metriken werden für Qwen Code erfasst (die Metriknamen bleiben aus Kompatibilitätsgründen weiterhin `qwen-code.*`):

- `qwen-code.session.count` (Zähler, Ganzzahl): Wird bei jedem Start der CLI einmal erhöht.

- `qwen-code.tool.call.count` (Zähler, Ganzzahl): Zählt Tool-Aufrufe.  
  - **Attribute**:  
    - `function_name`  
    - `success` (boolesch)  
    - `decision` (Zeichenkette: „accept“, „reject“ oder „modify“, falls zutreffend)  
    - `tool_type` (Zeichenkette: „mcp“ oder „native“, falls zutreffend)  

- `qwen-code.tool.call.latency` (Histogram, ms): Misst die Latenz von Tool-Aufrufen.  
  - **Attribute**:  
    - `function_name`  
    - `decision` (Zeichenkette: „accept“, „reject“ oder „modify“, falls zutreffend)  

- `qwen-code.api.request.count` (Zähler, Ganzzahl): Zählt alle API-Anfragen.  
  - **Attribute**:  
    - `model`  
    - `status_code`  
    - `error_type` (falls zutreffend)  

- `qwen-code.api.request.latency` (Histogram, ms): Misst die Latenz von API-Anfragen.  
  - **Attribute**:  
    - `model`  

- `qwen-code.token.usage` (Zähler, Ganzzahl): Zählt die Anzahl verwendeter Tokens.  
  - **Attribute**:  
    - `model`  
    - `type` (Zeichenkette: „input“, „output“, „thought“, „cache“ oder „tool“)  

- `qwen-code.file.operation.count` (Zähler, Ganzzahl): Zählt Dateioperationen.  
  - **Attribute**:  
    - `operation` (Zeichenkette: „create“, „read“, „update“): Der Typ der Dateioperation.  
    - `lines` (Ganzzahl, falls zutreffend): Anzahl der Zeilen in der Datei.  
    - `mimetype` (Zeichenkette, falls zutreffend): MIME-Typ der Datei.  
    - `extension` (Zeichenkette, falls zutreffend): Dateierweiterung der Datei.  
    - `model_added_lines` (Ganzzahl, falls zutreffend): Anzahl der Zeilen, die vom Modell hinzugefügt/geändert wurden.  
    - `model_removed_lines` (Ganzzahl, falls zutreffend): Anzahl der Zeilen, die vom Modell entfernt/geändert wurden.  
    - `user_added_lines` (Ganzzahl, falls zutreffend): Anzahl der Zeilen, die vom Benutzer in den vom KI-Modell vorgeschlagenen Änderungen hinzugefügt/geändert wurden.  
    - `user_removed_lines` (Ganzzahl, falls zutreffend): Anzahl der Zeilen, die vom Benutzer in den vom KI-Modell vorgeschlagenen Änderungen entfernt/geändert wurden.  
    - `programming_language` (Zeichenkette, falls zutreffend): Programmiersprache der Datei.  

- `qwen-code.chat_compression` (Zähler, Ganzzahl): Zählt Chat-Komprimierungsvorgänge  
  - **Attribute**:  
    - `tokens_before`: (Ganzzahl): Anzahl der Tokens im Kontext vor der Komprimierung  
    - `tokens_after`: (Ganzzahl): Anzahl der Tokens im Kontext nach der Komprimierung