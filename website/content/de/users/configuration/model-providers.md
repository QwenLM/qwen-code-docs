# Modellanbieter

Mit Qwen Code können Sie mehrere Modellanbieter über die Einstellung `modelProviders` in Ihrer `settings.json` konfigurieren. Dadurch können Sie mithilfe des Befehls `/model` zwischen verschiedenen KI-Modellen und Anbietern wechseln.

## Übersicht

Verwenden Sie `modelProviders`, um kuratierte Modelllisten pro Authentifizierungstyp zu deklarieren, zwischen denen der `/model`-Auswahlmenü wechseln kann. Die Schlüssel müssen gültige Authentifizierungstypen sein (`openai`, `anthropic`, `gemini`, `vertex-ai`, usw.). Jeder Eintrag erfordert eine `id` und **muss `envKey` enthalten**, optional können `name`, `description`, `baseUrl` und `generationConfig` hinzugefügt werden. Anmeldedaten werden niemals in den Einstellungen gespeichert; die Laufzeit liest sie aus `process.env[envKey]`. Qwen-OAuth-Modelle bleiben hartkodiert und können nicht überschrieben werden.

> [!note]
>
> Nur der Befehl `/model` zeigt Nicht-Standard-Authentifizierungstypen an. Anthropic, Gemini, Vertex AI usw. müssen über `modelProviders` definiert werden. Der Befehl `/auth` listet absichtlich nur die integrierten Qwen-OAuth- und OpenAI-Flows auf.

> [!warning]
>
> **Doppelte Modell-IDs innerhalb desselben Authentifizierungstyps:** Das Definieren mehrerer Modelle mit derselben `id` unter einem einzigen `authType` (z.B. zwei Einträge mit `"id": "gpt-4o"` in `openai`) wird derzeit nicht unterstützt. Falls Duplikate vorhanden sind, **gewinnt das erste Vorkommen** und nachfolgende Duplikate werden mit einer Warnung übersprungen. Beachten Sie, dass das Feld `id` sowohl als Konfigurationsidentifikator als auch als tatsächlicher Modellname verwendet wird, der an die API gesendet wird, daher ist die Verwendung eindeutiger IDs (z.B. `gpt-4o-creative`, `gpt-4o-balanced`) keine funktionierende Lösung. Dies ist eine bekannte Einschränkung, die wir in einer zukünftigen Version beheben möchten.

## Konfigurationsbeispiele nach Authentifizierungstyp

Nachfolgend finden Sie umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen mit den verfügbaren Parametern und deren Kombinationen.

### Unterstützte Authentifizierungsarten

Die Schlüssel des `modelProviders`-Objekts müssen gültige `authType`-Werte sein. Derzeit unterstützte Authentifizierungsarten sind:

| Authentifizierungsart | Beschreibung                                                                                   |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `openai`              | OpenAI-kompatible APIs (OpenAI, Azure OpenAI, lokale Inferenzserver wie vLLM/Ollama)          |
| `anthropic`           | Anthropic Claude API                                                                           |
| `gemini`              | Google Gemini API                                                                              |
| `vertex-ai`           | Google Vertex AI                                                                               |
| `qwen-oauth`          | Qwen OAuth (fest codiert, kann nicht in `modelProviders` überschrieben werden)                |

> [!warning]
> Wenn ein ungültiger Authentifizierungstyp-Schlüssel verwendet wird (z.B. ein Tippfehler wie `"openai-custom"`), wird die Konfiguration **still übersprungen** und die Modelle erscheinen nicht im `/model`-Auswahlmenü. Verwenden Sie immer einen der oben aufgeführten unterstützten Authentifizierungstypen.

### SDKs für API-Anfragen

Qwen Code verwendet die folgenden offiziellen SDKs, um Anfragen an jeden Anbieter zu senden:

| Authentifizierungstyp  | SDK-Paket                                                                                       |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `openai`               | [`openai`](https://www.npmjs.com/package/openai) - Offizielles OpenAI Node.js SDK               |
| `anthropic`            | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Offizielles Anthropic SDK |
| `gemini` / `vertex-ai` | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Offizielles Google GenAI SDK   |
| `qwen-oauth`           | [`openai`](https://www.npmjs.com/package/openai) mit benutzerdefiniertem Anbieter (DashScope-kompatibel) |

Das bedeutet, dass die von Ihnen konfigurierte `baseUrl` mit dem erwarteten API-Format des entsprechenden SDK kompatibel sein muss. Wenn Sie beispielsweise den Authentifizierungstyp `openai` verwenden, muss der Endpunkt OpenAI-API-Format-Anfragen akzeptieren.

### OpenAI-kompatible Anbieter (`openai`)

Dieser Authentifizierungstyp unterstützt nicht nur die offizielle OpenAI-API, sondern auch jeden OpenAI-kompatiblen Endpunkt, einschließlich aggregierter Modellanbieter wie OpenRouter.

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "enableCacheControl": true,
          "contextWindowSize": 128000,
          "customHeaders": {
            "X-Client-Request-ID": "req-123"
          },
          "extra_body": {
            "enable_thinking": true,
            "service_tier": "priority"
          },
          "samplingParams": {
            "temperature": 0.2,
            "top_p": 0.8,
            "max_tokens": 4096,
            "presence_penalty": 0.1,
            "frequency_penalty": 0.1
          }
        }
      },
      {
        "id": "gpt-4o-mini",
        "name": "GPT-4o Mini",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 30000,
          "samplingParams": {
            "temperature": 0.5,
            "max_tokens": 2048
          }
        }
      },
      {
        "id": "openai/gpt-4o",
        "name": "GPT-4o (über OpenRouter)",
        "envKey": "OPENROUTER_API_KEY",
        "baseUrl": "https://openrouter.ai/api/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "samplingParams": {
            "temperature": 0.7
          }
        }
      }
    ]
  }
}
```

### Anthropic (`anthropic`)

```json
{
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-3-5-sonnet",
        "name": "Claude 3.5 Sonnet",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 3,
          "contextWindowSize": 200000,
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 8192,
            "top_p": 0.9
          }
        }
      },
      {
        "id": "claude-3-opus",
        "name": "Claude 3 Opus",
        "envKey": "ANTHROPIC_API_KEY",
        "baseUrl": "https://api.anthropic.com/v1",
        "generationConfig": {
          "timeout": 180000,
          "samplingParams": {
            "temperature": 0.3,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

### Google Gemini (`gemini`)

```json
{
  "modelProviders": {
    "gemini": [
      {
        "id": "gemini-2.0-flash",
        "name": "Gemini 2.0 Flash",
        "envKey": "GEMINI_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "capabilities": {
          "vision": true
        },
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 2,
          "contextWindowSize": 1000000,
          "schemaCompliance": "auto",
          "samplingParams": {
            "temperature": 0.4,
            "top_p": 0.95,
            "max_tokens": 8192,
            "top_k": 40
          }
        }
      }
    ]
  }
}
```

### Google Vertex AI (`vertex-ai`)

```json
{
  "modelProviders": {
    "vertex-ai": [
      {
        "id": "gemini-1.5-pro-vertex",
        "name": "Gemini 1.5 Pro (Vertex AI)",
        "envKey": "GOOGLE_API_KEY",
        "baseUrl": "https://generativelanguage.googleapis.com",
        "generationConfig": {
          "timeout": 90000,
          "contextWindowSize": 2000000,
          "samplingParams": {
            "temperature": 0.2,
            "max_tokens": 8192
          }
        }
      }
    ]
  }
}
```

### Lokale selbstgehostete Modelle (über OpenAI-kompatibles API)

Die meisten lokalen Inference-Server (vLLM, Ollama, LM Studio usw.) stellen einen OpenAI-kompatiblen API-Endpunkt bereit. Konfigurieren Sie diese mit dem `openai` Authentifizierungstyp und einer lokalen `baseUrl`:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "maxRetries": 1,
          "contextWindowSize": 32768,
          "samplingParams": {
            "temperature": 0.7,
            "top_p": 0.9,
            "max_tokens": 4096
          }
        }
      },
      {
        "id": "llama-3.1-8b",
        "name": "Llama 3.1 8B (vLLM)",
        "envKey": "VLLM_API_KEY",
        "baseUrl": "http://localhost:8000/v1",
        "generationConfig": {
          "timeout": 120000,
          "maxRetries": 2,
          "contextWindowSize": 128000,
          "samplingParams": {
            "temperature": 0.6,
            "max_tokens": 8192
          }
        }
      },
      {
        "id": "local-model",
        "name": "Local Model (LM Studio)",
        "envKey": "LMSTUDIO_API_KEY",
        "baseUrl": "http://localhost:1234/v1",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": {
            "temperature": 0.5
          }
        }
      }
    ]
  }
}
```

Für lokale Server, die keine Authentifizierung erfordern, können Sie einen beliebigen Platzhalterwert für den API-Schlüssel verwenden:

```bash

```bash
# Für Ollama (keine Authentifizierung erforderlich)
export OLLAMA_API_KEY="ollama"

# Für vLLM (falls keine Authentifizierung konfiguriert ist)
export VLLM_API_KEY="not-needed"
```

> [!note]
> 
> Der Parameter `extra_body` wird **nur für OpenAI-kompatible Anbieter** unterstützt (`openai`, `qwen-oauth`). Er wird von den Anbietern Anthropic, Gemini und Vertex AI ignoriert.

## Bailian-Codierungsplan

Der Bailian-Codierungsplan bietet einen vorkonfigurierten Satz an Qwen-Modellen, die für Codierungsaufgaben optimiert sind. Diese Funktion steht Benutzern mit Zugriff auf die Bailian-API zur Verfügung und bietet eine vereinfachte Einrichtungserfahrung mit automatischen Aktualisierungen der Modelleinstellungen.

### Übersicht

Wenn Sie sich mit einem Bailian Coding Plan API-Schlüssel über den Befehl `/auth` authentifizieren, konfiguriert Qwen Code automatisch die folgenden Modelle:

| Modell-ID              | Name                 | Beschreibung                           |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Fortgeschrittenes Modell mit aktiviertem Denken |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Für Codierungs-Aufgaben optimiert      |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Neuestes Max-Modell mit aktiviertem Denken |

### Einrichtung

1. Beschaffen Sie sich einen Bailian Coding Plan API-Schlüssel:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Führen Sie den Befehl `/auth` in Qwen Code aus
3. Wählen Sie die Authentifizierungsmethode über API-Schlüssel
4. Wählen Sie Ihre Region (China oder Global/International)
5. Geben Sie Ihren API-Schlüssel ein, wenn Sie dazu aufgefordert werden

Die Modelle werden automatisch konfiguriert und Ihrem `/model`-Auswahlmenü hinzugefügt.

### Regionen

Der Bailian-Codierungsplan unterstützt zwei Regionen:

| Region               | Endpunkt                                          | Beschreibung                 |
| -------------------- | ------------------------------------------------- | ---------------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`        | Endpunkt für Festland-China  |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1`   | Internationaler Endpunkt     |

Die Region wird während der Authentifizierung ausgewählt und in `settings.json` unter `codingPlan.region` gespeichert. Um die Region zu wechseln, führen Sie den Befehl `/auth` erneut aus und wählen Sie eine andere Region.

### API-Schlüsselspeicherung

Wenn Sie Coding Plan über den Befehl `/auth` konfigurieren, wird der API-Schlüssel unter Verwendung des reservierten Umgebungsvariablennamens `BAILIAN_CODING_PLAN_API_KEY` gespeichert. Standardmäßig wird er im Feld `settings.env` Ihrer Datei `settings.json` gespeichert.

> [!warning]
>
> **Sicherheitsempfehlung**: Aus Sicherheitsgründen wird empfohlen, den API-Schlüssel aus der Datei `settings.json` in eine separate `.env`-Datei zu verschieben und ihn als Umgebungsvariable zu laden. Beispiel:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=Ihr-API-Schlüssel-hier
> ```
>
> Stellen Sie anschließend sicher, dass diese Datei zu Ihrer `.gitignore` hinzugefügt wird, wenn Sie projektspezifische Einstellungen verwenden.

### Automatische Updates

Die Konfigurationen des Coding Plan-Modells sind versioniert. Wenn Qwen Code eine neuere Version der Modellvorlage erkennt, werden Sie zur Aktualisierung aufgefordert. Durch die Annahme des Updates wird Folgendes durchgeführt:

- Ersetzen der vorhandenen Coding Plan-Modellkonfigurationen durch die neuesten Versionen
- Beibehalten aller manuell hinzugefügten benutzerdefinierten Modellkonfigurationen
- Automatisches Wechseln zum ersten Modell in der aktualisierten Konfiguration

Der Update-Prozess stellt sicher, dass Sie jederzeit Zugriff auf die neuesten Modellkonfigurationen und Funktionen haben, ohne manuelles Eingreifen.

### Manuelle Konfiguration (Erweitert)

Wenn Sie die Coding Plan-Modelle manuell konfigurieren möchten, können Sie sie wie jeden anderen OpenAI-kompatiblen Anbieter zu Ihrer `settings.json` hinzufügen:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder über Bailian Coding Plan",
        "envKey": "YOUR_CUSTOM_ENV_KEY",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
      }
    ]
  }
}
```

> [!note]
>
> Bei Verwendung der manuellen Konfiguration:
>
> - Sie können einen beliebigen Namen für die Umgebungsvariable `envKey` verwenden
> - Sie müssen `codingPlan.*` nicht konfigurieren
> - **Automatische Updates werden nicht auf manuell konfigurierte Coding Plan-Modelle angewendet**

> [!warning]
>
> Wenn Sie auch die automatische Coding Plan-Konfiguration verwenden, können automatische Updates Ihre manuellen Konfigurationen überschreiben, wenn dieselben `envKey` und `baseUrl` wie bei der automatischen Konfiguration verwendet werden. Um dies zu vermeiden, stellen Sie sicher, dass Ihre manuelle Konfiguration nach Möglichkeit einen anderen `envKey` verwendet.

## Auflösungsschichten und Atomarität

Die effektiven Authentifizierungs-/Modell-/Anmeldedatenwerte werden pro Feld nach folgender Priorität ausgewählt (zuerst vorhanden gewinnt). Sie können `--auth-type` mit `--model` kombinieren, um direkt auf einen Anbietereintrag zu verweisen; diese CLI-Flags werden vor anderen Schichten ausgeführt.

| Schicht (höchste → niedrigste) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ------------------------------ | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatische Überschreibungen | `/auth`                             | `/auth` Eingabe                                   | `/auth` Eingabe                                       | `/auth` Eingabe                                        | —                      | —                                 |
| Modellanbieterauswahl          | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI-Argumente                  | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (oder anbieterspezifische Äquivalente) | `--openaiBaseUrl` (oder anbieterspezifische Äquivalente) | —                      | —                                 |
| Umgebungsvariablen             | —                                   | Anbieterspezifisches Mapping (z.B. `OPENAI_MODEL`) | Anbieterspezifisches Mapping (z.B. `OPENAI_API_KEY`)   | Anbieterspezifisches Mapping (z.B. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Einstellungen (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Standard / berechnet           | Fallback auf `AuthType.QWEN_OAUTH`  | Integrierter Standard (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` falls konfiguriert |

\*Falls vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmen `security.auth.selectedType` oder der implizite Standard den Authentifizierungstyp. Qwen OAuth und OpenAI sind die einzigen Authentifizierungstypen, die ohne zusätzliche Konfiguration angezeigt werden.

> [!warning]
> 
> **Veraltung von `security.auth.apiKey` und `security.auth.baseUrl`:** Die direkte Konfiguration von API-Anmeldedaten über `security.auth.apiKey` und `security.auth.baseUrl` in `settings.json` ist veraltet. Diese Einstellungen wurden in früheren Versionen für Anmeldedaten verwendet, die über die Benutzeroberfläche eingegeben wurden, aber der Anmeldedateneingabeprozess wurde in Version 0.10.1 entfernt. Diese Felder werden in einer zukünftigen Version vollständig entfernt. **Es wird dringend empfohlen, zu `modelProviders` zu migrieren** für alle Modell- und Anmeldedatenkonfigurationen. Verwenden Sie `envKey` in `modelProviders`, um auf Umgebungsvariablen zu verweisen, um Anmeldedaten sicher zu verwalten, anstatt sie in Einstellungsdateien hart zu codieren.

## Generierungskonfigurations-Schichtung: Die undurchdringliche Anbieterschicht

Die Konfigurationsauflösung folgt einem strengen Schichtungsmodell mit einer entscheidenden Regel: **die modelProvider-Schicht ist undurchdringlich**.

### Funktionsweise

1. **Wenn ein modelProvider-Modell AUSGEWÄHLT ist** (z.B. über den `/model`-Befehl mit Auswahl eines provider-konfigurierten Modells):
   - Die gesamte `generationConfig` des Providers wird **atomar** angewendet
   - **Die Provider-Ebene ist völlig undurchlässig** — untere Ebenen (CLI, Umgebung, Einstellungen) beteiligen sich überhaupt nicht an der generationConfig-Auflösung
   - Alle in `modelProviders[].generationConfig` definierten Felder verwenden die Werte des Providers
   - Alle Felder, die vom Provider **nicht definiert** sind, werden auf `undefined` gesetzt (nicht von den Einstellungen geerbt)
   - Dies stellt sicher, dass Provider-Konfigurationen als vollständiges, eigenständiges "versiegeltes Paket" fungieren

2. **Wenn KEIN modelProvider-Modell ausgewählt ist** (z.B. bei Verwendung von `--model` mit einer Roh-Modell-ID oder direkter Nutzung von CLI/Umgebung/Einstellungen):
   - Die Auflösung fällt auf die unteren Ebenen zurück
   - Felder werden aus CLI → Umgebung → Einstellungen → Standardwerten befüllt
   - Dadurch entsteht ein **Laufzeitmodell** (siehe nächsten Abschnitt)

### Feldspezifische Priorität für `generationConfig`

| Priorität | Quelle                                        | Verhalten                                                                                                |
| --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1         | Programmatische Überschreibungen              | Laufzeit-Änderungen von `/model`, `/auth`                                                                |
| 2         | `modelProviders[authType][].generationConfig` | **Undurchlässige Schicht** - ersetzt vollständig alle generationConfig-Felder; untere Schichten beteiligen sich nicht |
| 3         | `settings.model.generationConfig`             | Wird nur für **Laufzeitmodelle** verwendet (wenn kein Anbietermodell ausgewählt ist)                     |
| 4         | Standardwerte des Inhaltsgenerators           | Anbieterspezifische Standards (z.B. OpenAI vs. Gemini) - nur für Laufzeitmodelle                        |

### Behandlung atomarer Felder

Die folgenden Felder werden als atomare Objekte behandelt – Anbieterwerte ersetzen das gesamte Objekt vollständig, es erfolgt keine Zusammenführung:

- `samplingParams` – Temperatur, top_p, max_tokens usw.
- `customHeaders` – Benutzerdefinierte HTTP-Header
- `extra_body` – Zusätzliche Parameter für den Request-Body

### Beispiel

```json
// Benutzereinstellungen (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders-Konfiguration
{
  "modelProviders": {
    "openai": [{
      "id": "gpt-4o",
      "envKey": "OPENAI_API_KEY",
      "generationConfig": {
        "timeout": 60000,
        "samplingParams": { "temperature": 0.2 }
      }
    }]
  }
}
```

Wenn `gpt-4o` aus modelProviders ausgewählt wird:

- `timeout` = 60000 (vom Anbieter, überschreibt Einstellungen)
- `samplingParams.temperature` = 0.2 (vom Anbieter, ersetzt das Einstellungsobjekt vollständig)
- `samplingParams.max_tokens` = **undefined** (nicht im Anbieter definiert, und die Anbieterebene erbt nicht von den Einstellungen — Felder werden explizit auf undefined gesetzt, wenn sie nicht bereitgestellt werden)

Beim Verwenden eines Rohmodells über `--model gpt-4` (nicht aus modelProviders, erstellt ein Laufzeitmodell):

- `timeout` = 30000 (aus den Einstellungen)
- `samplingParams.temperature` = 0.5 (aus den Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus den Einstellungen)

Die Merge-Strategie für `modelProviders` selbst ist REPLACE: Das gesamte `modelProviders` aus den Projekteinstellungen überschreibt den entsprechenden Abschnitt in den Benutzereinstellungen, anstatt die beiden zusammenzuführen.

## Anbietermodelle vs. Laufzeitmodelle

Qwen Code unterscheidet zwischen zwei Arten von Modellkonfigurationen:

### Anbietermodell

- Definiert in der `modelProviders`-Konfiguration
- Hat ein vollständiges, atomares Konfigurationspaket
- Wenn ausgewählt, wird seine Konfiguration als undurchlässige Schicht angewendet
- Erscheint in der Befehlsliste `/model` mit vollständigen Metadaten (Name, Beschreibung, Fähigkeiten)
- Empfohlen für Multi-Model-Workflows und Team-Konsistenz

### Laufzeitmodell

- Wird dynamisch erstellt, wenn Roh-Modell-IDs über die CLI (`--model`), Umgebungsvariablen oder Einstellungen verwendet werden
- Nicht definiert in `modelProviders`
- Konfiguration wird durch "Projektion" über Auflösungsschichten erstellt (CLI → Umgebung → Einstellungen → Standardwerte)
- Wird automatisch als **RuntimeModelSnapshot** erfasst, sobald eine vollständige Konfiguration erkannt wird
- Erlaubt Wiederverwendung ohne erneutes Eingeben von Anmeldeinformationen

### RuntimeModelSnapshot-Lebenszyklus

Wenn Sie ein Modell konfigurieren, ohne `modelProviders` zu verwenden, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um Ihre Konfiguration zu speichern:

```bash

# Dies erstellt einen RuntimeModelSnapshot mit der ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Der Snapshot:

- Erfasst Modell-ID, API-Schlüssel, Basis-URL und Generierungskonfiguration
- Bleibt über Sitzungen hinweg erhalten (wird während der Laufzeit im Speicher gehalten)
- Erscheint in der Liste des `/model`-Befehls als Laufzeitoption
- Kann durch `/model $runtime|openai|my-custom-model` gewechselt werden

### Wichtige Unterschiede

| Aspekt                  | Provider-Modell                   | Laufzeitmodell                             |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Konfigurationsquelle    | `modelProviders` in Einstellungen | CLI, Umgebung, Einstellungsschichten       |
| Konfigurationsatomizität| Vollständiges, undurchlässiges Paket | Geschichtet, jedes Feld wird unabhängig aufgelöst |
| Wiederverwendbarkeit    | Immer in der `/model`-Liste verfügbar | Als Snapshot erfasst, erscheint wenn vollständig |
| Teilen innerhalb des Teams | Ja (über übermittelte Einstellungen) | Nein (benutzerspezifisch)                  |
| Speicherung von Anmeldedaten | Nur Referenz über `envKey`        | Kann tatsächlichen Schlüssel im Snapshot erfassen |

### Wann welches verwendet werden sollte

- **Provider-Modelle verwenden**, wenn: Sie über Standardmodelle verfügen, die im Team gemeinsam genutzt werden, konsistente Konfigurationen benötigen oder versehentliche Überschreibungen verhindern möchten
- **Laufzeitmodelle (Runtime Models) verwenden**, wenn: Sie schnell ein neues Modell testen, temporäre Anmeldedaten verwenden oder mit Ad-hoc-Endpunkten arbeiten

## Auswahl-Persistenz und Empfehlungen

> [!important]
> 
> Definieren Sie `modelProviders` im benutzerspezifischen `~/.qwen/settings.json`, wann immer möglich, und vermeiden Sie das Speichern von Anmeldeinformationen in beliebigen Bereichen. Das Festhalten des Provider-Katalogs in den Benutzereinstellungen verhindert Merge-/Überschreibekonflikte zwischen Projekt- und Benutzerbereich und stellt sicher, dass `/auth` und `/model`-Aktualisierungen immer in einen konsistenten Bereich geschrieben werden.

- `/model` und `/auth` speichern `model.name` (wenn zutreffend) und `security.auth.selectedType` im nächstgelegenen beschreibbaren Bereich, der bereits `modelProviders` definiert; andernfalls greifen sie auf den Benutzerbereich zurück. Dadurch bleiben Arbeitsbereichs-/Benutzerdateien synchron mit dem aktiven Provider-Katalog.
- Ohne `modelProviders` kombiniert der Resolver CLI-/Umgebungs-/Einstellungsebenen und erstellt Laufzeitmodelle. Dies ist für Einzelprovider-Setups in Ordnung, aber umständlich bei häufigem Wechsel. Definieren Sie Provider-Kataloge immer dann, wenn Mehrfachmodell-Workflows üblich sind, damit Umschaltvorgänge atomar, quellenbezogen und debuggbar bleiben.