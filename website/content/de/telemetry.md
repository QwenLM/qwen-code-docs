# Qwen Code Observability Guide

Telemetry stellt Daten über die Performance, den Zustand und die Nutzung von Qwen Code bereit. Wenn du es aktivierst, kannst du Abläufe überwachen, Probleme debuggen und die Tool-Nutzung mithilfe von Traces, Metriken und strukturierten Logs optimieren.

Das Telemetriesystem von Qwen Code basiert auf dem **[OpenTelemetry] (OTEL)**-Standard, wodurch du Daten an jedes kompatible Backend senden kannst.

[OpenTelemetry]: https://opentelemetry.io/

## Telemetrie aktivieren

Du kannst Telemetrie auf verschiedene Arten aktivieren. Die Konfiguration erfolgt hauptsächlich über die [`.qwen/settings.json`-Datei](./cli/configuration.md) und Umgebungsvariablen, aber CLI-Flags können diese Einstellungen für eine bestimmte Sitzung überschreiben.

### Rangfolge

Die folgende Liste zeigt die Rangfolge beim Anwenden der Telemetrie-Einstellungen, wobei Einträge weiter oben eine höhere Priorität haben:

1.  **CLI-Flags (für den `qwen`-Befehl):**
    - `--telemetry` / `--no-telemetry`: Überschreibt `telemetry.enabled`.
    - `--telemetry-target <local|gcp>`: Überschreibt `telemetry.target`.
    - `--telemetry-otlp-endpoint <URL>`: Überschreibt `telemetry.otlpEndpoint`.
    - `--telemetry-log-prompts` / `--no-telemetry-log-prompts`: Überschreibt `telemetry.logPrompts`.
    - `--telemetry-outfile <path>`: Leitet die Telemetrie-Ausgabe in eine Datei um. Siehe [Exportieren in eine Datei](#exporting-to-a-file).

1.  **Umgebungsvariablen:**
    - `OTEL_EXPORTER_OTLP_ENDPOINT`: Überschreibt `telemetry.otlpEndpoint`.

1.  **Workspace-Einstellungsdatei (`.qwen/settings.json`):** Werte aus dem `telemetry`-Objekt in dieser projektspezifischen Datei.

1.  **Benutzereinstellungsdatei (`~/.qwen/settings.json`):** Werte aus dem `telemetry`-Objekt in dieser globalen Benutzerdatei.

1.  **Standardwerte:** Werden angewendet, wenn sie nicht durch eine der oben genannten Optionen gesetzt wurden.
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**Für das `npm run telemetry -- --target=<gcp|local>`-Skript:**
Das `--target`-Argument dieses Skripts überschreibt _nur_ den `telemetry.target` für die Dauer und den Zweck dieses Skripts (d. h. zur Auswahl des zu startenden Collectors). Es ändert nicht dauerhaft deine `settings.json`. Das Skript prüft zunächst in der `settings.json`, ob ein `telemetry.target` als Standardwert vorhanden ist.

### Beispiel-Einstellungen

Der folgende Code kann in deine Workspace-Einstellungen (`.qwen/settings.json`) oder in deine User-Einstellungen (`~/.qwen/settings.json`) hinzugefügt werden, um Telemetrie zu aktivieren und die Ausgabe an Google Cloud zu senden:

```json
{
  "telemetry": {
    "enabled": true,
    "target": "gcp"
  },
  "sandbox": false
}
```

### Export in eine Datei

Du kannst alle Telemetriedaten in eine Datei exportieren, um sie lokal zu inspizieren.

Um den Export in eine Datei zu aktivieren, verwende das Flag `--telemetry-outfile` mit einem Pfad zur gewünschten Ausgabedatei. Dies muss zusammen mit `--telemetry-target=local` ausgeführt werden.

```bash

# Lege deinen gewünschten Ausgabedateipfad fest
TELEMETRY_FILE=".qwen/telemetry.log"

# Führe Qwen Code mit lokaler Telemetrie aus

# HINWEIS: --telemetry-otlp-endpoint="" ist erforderlich, um den Standard-

# OTLP-Exporter zu überschreiben und sicherzustellen, dass die Telemetriedaten in die lokale Datei geschrieben werden.
qwen --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## Einen OTEL Collector ausführen

Ein OTEL Collector ist ein Service, der Telemetriedaten empfängt, verarbeitet und exportiert.
Die CLI kann Daten entweder über das OTLP/gRPC- oder OTLP/HTTP-Protokoll senden.
Du kannst festlegen, welches Protokoll verwendet werden soll, über das Flag `--telemetry-otlp-protocol`
oder die Einstellung `telemetry.otlpProtocol` in deiner `settings.json`-Datei. Weitere
Informationen findest du in der [Konfigurationsdokumentation](./cli/configuration.md#--telemetry-otlp-protocol).

Weitere Informationen zur Standardkonfiguration des OTEL Exporters findest du in der [Dokumentation][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Lokal

Verwende den Befehl `npm run telemetry -- --target=local`, um den Prozess zur Einrichtung einer lokalen Telemetrie-Pipeline zu automatisieren. Dazu gehört auch das Konfigurieren der erforderlichen Einstellungen in deiner Datei `.qwen/settings.json`. Das zugrunde liegende Skript installiert `otelcol-contrib` (den OpenTelemetry Collector) und `jaeger` (das Jaeger UI zum Anzeigen von Traces). So gehst du vor:

1.  **Führe den Befehl aus**:  
    Führe den Befehl im Root-Verzeichnis des Repositorys aus:

    ```bash
    npm run telemetry -- --target=local
    ```

    Das Skript führt folgende Aktionen durch:
    - Lädt Jaeger und OTEL herunter, falls nötig.
    - Startet eine lokale Jaeger-Instanz.
    - Startet einen OTEL-Collector, der für den Empfang von Daten von Qwen Code konfiguriert ist.
    - Aktiviert die Telemetrie automatisch in deinen Workspace-Einstellungen.
    - Deaktiviert beim Beenden die Telemetrie.

2.  **Traces anzeigen**:  
    Öffne deinen Webbrowser und navigiere zu **http://localhost:16686**, um auf das Jaeger UI zuzugreifen. Dort kannst du detaillierte Traces der Qwen Code-Vorgänge einsehen.

3.  **Logs und Metriken prüfen**:  
    Das Skript leitet die Ausgabe des OTEL Collectors (einschließlich Logs und Metriken) in die Datei `~/.qwen/tmp/<projectHash>/otel/collector.log` um. Es werden Links angezeigt, über die du deine Telemetriedaten (Traces, Metriken, Logs) lokal einsehen kannst, sowie ein Befehl, um diese live mitzuverfolgen.

4.  **Dienste stoppen**:  
    Drücke `Ctrl+C` im Terminal, in dem das Skript läuft, um den OTEL Collector und die Jaeger-Dienste zu stoppen.

### Google Cloud

Verwende den Befehl `npm run telemetry -- --target=gcp`, um automatisch einen lokalen OpenTelemetry Collector einzurichten, der Daten an dein Google Cloud-Projekt weiterleitet. Dazu gehören auch die notwendigen Konfigurationen in deiner `.qwen/settings.json`-Datei. Das zugrunde liegende Skript installiert `otelcol-contrib`. So geht's:

1.  **Voraussetzungen**:
    - Du benötigst eine Google Cloud Project ID.
    - Exportiere die Umgebungsvariable `GOOGLE_CLOUD_PROJECT`, damit sie für den OTEL Collector verfügbar ist.
      ```bash
      export OTLP_GOOGLE_CLOUD_PROJECT="your-project-id"
      ```
    - Authentifiziere dich bei Google Cloud (z. B. mit `gcloud auth application-default login` oder stelle sicher, dass `GOOGLE_APPLICATION_CREDENTIALS` gesetzt ist).
    - Stelle sicher, dass dein Google Cloud-Konto bzw. dein Service-Account über die erforderlichen IAM-Rollen verfügt: "Cloud Trace Agent", "Monitoring Metric Writer" und "Logs Writer".

1.  **Befehl ausführen**:
    Führe den Befehl im Root-Verzeichnis deines Repositorys aus:

    ```bash
    npm run telemetry -- --target=gcp
    ```

    Das Skript wird:
    - Die `otelcol-contrib`-Binary herunterladen (falls nötig).
    - Einen OTEL Collector starten, der so konfiguriert ist, dass er Daten von Qwen Code empfängt und an dein angegebenes Google Cloud-Projekt exportiert.
    - Telemetrie automatisch aktivieren und den Sandbox-Modus in deinen Workspace-Einstellungen (`.qwen/settings.json`) deaktivieren.
    - Direkte Links bereitstellen, um Traces, Metriken und Logs in der Google Cloud Console anzuzeigen.
    - Beim Beenden (Strg+C) versuchen, deine ursprünglichen Telemetrie- und Sandbox-Einstellungen wiederherzustellen.

1.  **Qwen Code ausführen**:
    Führe in einem separaten Terminal deine Qwen Code-Befehle aus. Dadurch werden Telemetriedaten generiert, die vom Collector erfasst werden.

1.  **Telemetrie in Google Cloud anzeigen**:
    Verwende die vom Skript bereitgestellten Links, um zur Google Cloud Console zu navigieren und deine Traces, Metriken und Logs einzusehen.

1.  **Lokale Collector-Logs einsehen**:
    Das Skript leitet die Ausgabe des lokalen OTEL Collectors in die Datei `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` um. Es stellt auch Links und Befehle bereit, um die Logs lokal anzusehen oder zu tailen.

1.  **Dienst stoppen**:
    Drücke `Strg+C` im Terminal, in dem das Skript läuft, um den OTEL Collector zu stoppen.

## Referenz für Logs und Metriken

Der folgende Abschnitt beschreibt die Struktur der Logs und Metriken, die für Qwen Code generiert werden.

- Eine `sessionId` ist als gemeinsames Attribut in allen Logs und Metriken enthalten.

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

- `qwen-code.user_prompt`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Prompt absendet.
  - **Attribute**:
    - `prompt_length` (int)
    - `prompt_id` (string)
    - `prompt` (string, dieses Attribut wird ausgelassen, wenn `log_prompts_enabled` auf `false` konfiguriert ist)
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
    - `metadata` (falls zutreffend, Dictionary von string -> any)

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

- `qwen-code.api_response`: Dieses Ereignis tritt ein, wenn eine Antwort von der Qwen API empfangen wird.
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

- `qwen-code.flash_fallback`: Dieses Ereignis tritt auf, wenn Qwen Code auf Flash als Fallback wechselt.
  - **Attribute**:
    - `auth_type`

- `qwen-code.slash_command`: Dieses Ereignis tritt auf, wenn ein Benutzer einen Slash-Befehl ausführt.
  - **Attribute**:
    - `command` (string)
    - `subcommand` (string, falls zutreffend)

### Metriken

Metriken sind numerische Messungen des Verhaltens über einen bestimmten Zeitraum. Für Qwen Code werden die folgenden Metriken gesammelt (die Metriknamen bleiben aus Kompatibilitätsgründen `qwen-code.*`):

- `qwen-code.session.count` (Counter, Int): Wird bei jedem CLI-Start um eins erhöht.

- `qwen-code.tool.call.count` (Counter, Int): Zählt die Anzahl der Tool-Aufrufe.
  - **Attribute**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject", oder "modify", falls zutreffend)
    - `tool_type` (string: "mcp", oder "native", falls zutreffend)

- `qwen-code.tool.call.latency` (Histogram, ms): Misst die Latenz von Tool-Aufrufen.
  - **Attribute**:
    - `function_name`
    - `decision` (string: "accept", "reject", oder "modify", falls zutreffend)

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
    - `type` (string: "input", "output", "thought", "cache", oder "tool")

- `qwen-code.file.operation.count` (Counter, Int): Zählt Dateioperationen.
  - **Attribute**:
    - `operation` (string: "create", "read", "update"): Der Typ der Dateioperation.
    - `lines` (Int, falls zutreffend): Anzahl der Zeilen in der Datei.
    - `mimetype` (string, falls zutreffend): Mimetype der Datei.
    - `extension` (string, falls zutreffend): Dateiendung der Datei.
    - `ai_added_lines` (Int, falls zutreffend): Anzahl der von der KI hinzugefügten/geänderten Zeilen.
    - `ai_removed_lines` (Int, falls zutreffend): Anzahl der von der KI entfernten/geänderten Zeilen.
    - `user_added_lines` (Int, falls zutreffend): Anzahl der vom Benutzer hinzugefügten/geänderten Zeilen in den von der KI vorgeschlagenen Änderungen.
    - `user_removed_lines` (Int, falls zutreffend): Anzahl der vom Benutzer entfernten/geänderten Zeilen in den von der KI vorgeschlagenen Änderungen.
    - `programming_language` (string, falls zutreffend): Die Programmiersprache der Datei.

- `qwen-code.chat_compression` (Counter, Int): Zählt die Chat-Komprimierungsoperationen.
  - **Attribute**:
    - `tokens_before`: (Int): Anzahl der Tokens im Kontext vor der Komprimierung.
    - `tokens_after`: (Int): Anzahl der Tokens im Kontext nach der Komprimierung.