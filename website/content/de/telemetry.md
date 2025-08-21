# Qwen Code Observability Guide

Telemetry liefert Daten über die Performance, den Zustand und die Nutzung von Qwen Code. Durch die Aktivierung kannst du Abläufe überwachen, Probleme debuggen und die Tool-Nutzung mithilfe von Traces, Metriken und strukturierten Logs optimieren.

Das Telemetriesystem von Qwen Code basiert auf dem **[OpenTelemetry] (OTEL)**-Standard und ermöglicht dir, Daten an jedes kompatible Backend zu senden.

[OpenTelemetry]: https://opentelemetry.io/

## Telemetrie aktivieren

Du kannst Telemetrie auf verschiedene Arten aktivieren. Die Konfiguration erfolgt hauptsächlich über die [`.qwen/settings.json`-Datei](./cli/configuration.md) und Umgebungsvariablen, aber CLI-Flags können diese Einstellungen für eine bestimmte Sitzung überschreiben.

### Rangfolge

Die folgende Liste zeigt die Rangfolge für die Anwendung der Telemetrie-Einstellungen, wobei Einträge weiter oben eine höhere Priorität haben:

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

1.  **Standardwerte:** Werden angewandt, wenn sie nicht durch eine der oben genannten Optionen gesetzt wurden.
    - `telemetry.enabled`: `false`
    - `telemetry.target`: `local`
    - `telemetry.otlpEndpoint`: `http://localhost:4317`
    - `telemetry.logPrompts`: `true`

**Für das Skript `npm run telemetry -- --target=<gcp|local>`:**
Das `--target`-Argument dieses Skripts überschreibt _nur_ den `telemetry.target` für die Dauer und den Zweck dieses Skripts (d. h. zur Auswahl des zu startenden Collectors). Es ändert Ihre `settings.json` nicht dauerhaft. Das Skript prüft zunächst in der `settings.json`, ob ein `telemetry.target` als Standardwert vorhanden ist.

### Beispiel-Einstellungen

Der folgende Code kann zu deinen Workspace-Einstellungen (`.qwen/settings.json`) oder User-Einstellungen (`~/.qwen/settings.json`) hinzugefügt werden, um Telemetrie zu aktivieren und die Ausgabe an Google Cloud zu senden:

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

Um den Dateiexport zu aktivieren, verwende das Flag `--telemetry-outfile` mit einem Pfad zu deiner gewünschten Ausgabedatei. Dies muss mit `--telemetry-target=local` ausgeführt werden.

```bash

# Setze den Pfad zur gewünschten Ausgabedatei
TELEMETRY_FILE=".qwen/telemetry.log"

# Führe Qwen Code mit lokaler Telemetrie aus

# HINWEIS: --telemetry-otlp-endpoint="" ist erforderlich, um den Standard-

# OTLP-Exporter zu überschreiben und sicherzustellen, dass die Telemetrie in die lokale Datei geschrieben wird.
qwen --telemetry \
  --telemetry-target=local \
  --telemetry-otlp-endpoint="" \
  --telemetry-outfile="$TELEMETRY_FILE" \
  --prompt "What is OpenTelemetry?"
```

## Einen OTEL Collector ausführen

Ein OTEL Collector ist ein Service, der Telemetriedaten empfängt, verarbeitet und exportiert.
Die CLI sendet Daten über das OTLP/gRPC-Protokoll.

Weitere Informationen zur Standardkonfiguration des OTEL Exporters findest du in der [Dokumentation][otel-config-docs].

[otel-config-docs]: https://opentelemetry.io/docs/languages/sdk-configuration/otlp-exporter/

### Lokal

Verwende den Befehl `npm run telemetry -- --target=local`, um den Prozess zur Einrichtung einer lokalen Telemetrie-Pipeline zu automatisieren. Dazu gehört auch das Konfigurieren der erforderlichen Einstellungen in deiner `.qwen/settings.json`-Datei. Das zugrunde liegende Skript installiert `otelcol-contrib` (den OpenTelemetry Collector) und `jaeger` (das Jaeger UI zur Anzeige von Traces). So gehst du vor:

1.  **Befehl ausführen**:
    Führe den Befehl im Root-Verzeichnis des Repositorys aus:

    ```bash
    npm run telemetry -- --target=local
    ```

    Das Skript wird:
    - Jaeger und OTEL herunterladen, falls nötig.
    - Eine lokale Jaeger-Instanz starten.
    - Einen OTEL-Collector starten, der für den Empfang von Daten aus Qwen Code konfiguriert ist.
    - Telemetrie automatisch in deinen Workspace-Einstellungen aktivieren.
    - Beim Beenden die Telemetrie wieder deaktivieren.

1.  **Traces anzeigen**:
    Öffne deinen Webbrowser und navigiere zu **http://localhost:16686**, um auf das Jaeger UI zuzugreifen. Dort kannst du detaillierte Traces der Qwen Code-Vorgänge einsehen.

1.  **Logs und Metriken prüfen**:
    Das Skript leitet die Ausgabe des OTEL-Collectors (einschließlich Logs und Metriken) in die Datei `~/.qwen/tmp/<projectHash>/otel/collector.log` um. Das Skript stellt dir Links zur Verfügung, um deine Telemetriedaten (Traces, Metriken, Logs) lokal anzusehen, sowie einen Befehl, um sie in Echtzeit zu verfolgen.

1.  **Dienste stoppen**:
    Drücke `Ctrl+C` im Terminal, in dem das Skript läuft, um den OTEL Collector und die Jaeger-Dienste zu stoppen.

### Google Cloud

Verwende den Befehl `npm run telemetry -- --target=gcp`, um automatisch einen lokalen OpenTelemetry Collector einzurichten, der Daten an dein Google Cloud-Projekt weiterleitet. Dazu gehören auch die notwendigen Konfigurationen in deiner `.qwen/settings.json`-Datei. Das zugrunde liegende Skript installiert `otelcol-contrib`. So gehst du vor:

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

    Das Skript führt folgende Aktionen durch:
    - Lädt bei Bedarf die `otelcol-contrib`-Binary herunter.
    - Startet einen OTEL Collector, der so konfiguriert ist, dass er Daten von Qwen Code empfängt und an dein angegebenes Google Cloud-Projekt exportiert.
    - Aktiviert automatisch Telemetrie und deaktiviert den Sandbox-Modus in deinen Workspace-Einstellungen (`.qwen/settings.json`).
    - Stellt direkte Links bereit, um Traces, Metriken und Logs in der Google Cloud Console anzuzeigen.
    - Beim Beenden (mit Strg+C) wird versucht, deine ursprünglichen Telemetrie- und Sandbox-Einstellungen wiederherzustellen.

1.  **Qwen Code ausführen**:
    Führe in einem separaten Terminal deine Qwen Code-Befehle aus. Dadurch werden Telemetriedaten generiert, die vom Collector erfasst werden.

1.  **Telemetrie in Google Cloud anzeigen**:
    Verwende die vom Skript bereitgestellten Links, um zur Google Cloud Console zu navigieren und deine Traces, Metriken und Logs einzusehen.

1.  **Lokale Collector-Logs einsehen**:
    Die Ausgabe des lokalen OTEL Collectors wird in `~/.qwen/tmp/<projectHash>/otel/collector-gcp.log` umgeleitet. Das Skript stellt Links zur Verfügung, um die Logs lokal anzuzeigen oder mit einem Befehl zu verfolgen (tail).

1.  **Dienst stoppen**:
    Drücke `Strg+C` im Terminal, in dem das Skript läuft, um den OTEL Collector zu stoppen.

## Referenz zu Logs und Metriken

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
    - `prompt_length`
    - `prompt` (dieses Attribut wird ausgelassen, wenn `log_prompts_enabled` auf `false` konfiguriert ist)
    - `auth_type`

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

- `qwen-code.api_request`: Dieses Ereignis tritt auf, wenn eine Anfrage an die Gemini API gesendet wird.
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

- `qwen-code.api_response`: Dieses Ereignis tritt ein, wenn eine Antwort von der Gemini API empfangen wird.
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

Metriken sind numerische Messungen des Verhaltens über die Zeit. Die folgenden Metriken werden für Qwen Code gesammelt (Metriknamen bleiben aus Kompatibilitätsgründen `qwen-code.*`):

- `qwen-code.session.count` (Zähler, Int): Wird bei jedem CLI-Start um eins erhöht.

- `qwen-code.tool.call.count` (Zähler, Int): Zählt die Tool-Aufrufe.
  - **Attribute**:
    - `function_name`
    - `success` (boolean)
    - `decision` (string: "accept", "reject" oder "modify", falls zutreffend)

- `qwen-code.tool.call.latency` (Histogramm, ms): Misst die Latenz von Tool-Aufrufen.
  - **Attribute**:
    - `function_name`
    - `decision` (string: "accept", "reject" oder "modify", falls zutreffend)

- `qwen-code.api.request.count` (Zähler, Int): Zählt alle API-Anfragen.
  - **Attribute**:
    - `model`
    - `status_code`
    - `error_type` (falls zutreffend)

- `qwen-code.api.request.latency` (Histogramm, ms): Misst die Latenz von API-Anfragen.
  - **Attribute**:
    - `model`

- `qwen-code.token.usage` (Zähler, Int): Zählt die Anzahl der verwendeten Tokens.
  - **Attribute**:
    - `model`
    - `type` (string: "input", "output", "thought", "cache" oder "tool")

- `qwen-code.file.operation.count` (Zähler, Int): Zählt Dateioperationen.
  - **Attribute**:
    - `operation` (string: "create", "read", "update"): Die Art der Dateioperation.
    - `lines` (Int, falls zutreffend): Anzahl der Zeilen in der Datei.
    - `mimetype` (string, falls zutreffend): Mimetype der Datei.
    - `extension` (string, falls zutreffend): Dateierweiterung der Datei.
    - `ai_added_lines` (Int, falls zutreffend): Anzahl der von der KI hinzugefügten/geänderten Zeilen.
    - `ai_removed_lines` (Int, falls zutreffend): Anzahl der von der KI entfernten/geänderten Zeilen.
    - `user_added_lines` (Int, falls zutreffend): Anzahl der vom Benutzer hinzugefügten/geänderten Zeilen in von der KI vorgeschlagenen Änderungen.
    - `user_removed_lines` (Int, falls zutreffend): Anzahl der vom Benutzer entfernten/geänderten Zeilen in von der KI vorgeschlagenen Änderungen.