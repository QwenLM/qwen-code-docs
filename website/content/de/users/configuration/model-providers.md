# Modellanbieter

Qwen Code ermöglicht es Ihnen, mehrere Modellanbieter über die Einstellung `modelProviders` in Ihrer Datei `settings.json` zu konfigurieren. Dadurch können Sie mithilfe des Befehls `/model` zwischen verschiedenen KI-Modellen und Anbietern wechseln.

## Übersicht

Verwenden Sie `modelProviders`, um für jeden Authentifizierungstyp kuratierte Modelllisten zu deklarieren, zwischen denen der `/model`-Picker wechseln kann. Die Schlüssel müssen gültige Authentifizierungstypen sein (`openai`, `anthropic`, `gemini`, usw.). Jeder Eintrag erfordert eine `id` und **muss `envKey` enthalten**, optional können `name`, `description`, `baseUrl` und `generationConfig` angegeben werden. Anmeldeinformationen werden niemals in den Einstellungen gespeichert; die Laufzeit liest sie stattdessen aus `process.env[envKey]`. Qwen-OAuth-Modelle bleiben hartcodiert und können nicht überschrieben werden.

> [!note]
>
> Nur der `/model`-Befehl stellt Nicht-Standard-Authentifizierungstypen zur Verfügung. Anthropic, Gemini usw. müssen über `modelProviders` definiert werden. Der `/auth`-Befehl listet Qwen OAuth, Alibaba Cloud Coding Plan und API Key als integrierte Authentifizierungsoptionen auf.

> [!warning]
>
> **Doppelte Modell-IDs innerhalb desselben Authentifizierungstyps:** Das Definieren mehrerer Modelle mit derselben `id` unter einem einzelnen `authType` (z. B. zwei Einträge mit `"id": "gpt-4o"` in `openai`) wird derzeit nicht unterstützt. Falls Duplikate vorhanden sind, **gewinnt die erste Instanz**, während nachfolgende Duplikate mit einer Warnung übersprungen werden. Beachten Sie, dass das `id`-Feld sowohl als Konfigurationsbezeichner als auch als tatsächlicher Modellname verwendet wird, der an die API gesendet wird. Daher ist die Verwendung eindeutiger IDs (z. B. `gpt-4o-creative`, `gpt-4o-balanced`) keine zulässige Problemumgehung. Dies ist eine bekannte Einschränkung, die wir in einer zukünftigen Version beheben werden.

## Konfigurationsbeispiele nach Authentifizierungstyp

Im Folgenden finden Sie umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen mit Angabe der verfügbaren Parameter und ihrer Kombinationen.

### Unterstützte Authentifizierungstypen

Die Schlüssel des `modelProviders`-Objekts müssen gültige `authType`-Werte sein. Derzeit unterstützte Authentifizierungstypen sind:

| Authentifizierungstyp | Beschreibung                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| `openai`              | OpenAI-kompatible APIs (OpenAI, Azure OpenAI, lokale Inferenzserver wie vLLM/Ollama)            |
| `anthropic`           | Anthropic Claude-API                                                                              |
| `gemini`              | Google Gemini-API                                                                                 |
| `qwen-oauth`          | Qwen OAuth (fest codiert, kann in `modelProviders` nicht überschrieben werden)                   |

> [!warning]
> Wird ein ungültiger Authentifizierungstyp verwendet (z. B. ein Tippfehler wie `"openai-custom"`), wird die Konfiguration **stillgeschwiegen übersprungen**, und die Modelle erscheinen nicht im `/model`-Auswahlfeld. Verwenden Sie stets einen der oben aufgeführten unterstützten Authentifizierungstypen.

### SDKs für API-Anfragen

Qwen Code verwendet die folgenden offiziellen SDKs, um Anfragen an die jeweiligen Anbieter zu senden:

| Authentifizierungstyp | SDK-Paket                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `openai`              | [`openai`](https://www.npmjs.com/package/openai) – Offizielles OpenAI-Node.js-SDK              |
| `anthropic`           | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) – Offizielles Anthropic-SDK |
| `gemini`              | [`@google/genai`](https://www.npmjs.com/package/@google/genai) – Offizielles Google-GenAI-SDK  |
| `qwen-oauth`          | [`openai`](https://www.npmjs.com/package/openai) mit benutzerdefiniertem Anbieter (kompatibel mit DashScope) |

Das bedeutet, dass die von Ihnen konfigurierte `baseUrl` mit dem vom entsprechenden SDK erwarteten API-Format kompatibel sein muss. Wenn Sie beispielsweise den Authentifizierungstyp `openai` verwenden, muss der Endpunkt Anfragen im OpenAI-API-Format akzeptieren.

### OpenAI-kompatible Anbieter (`openai`)

Dieser Authentifizierungstyp unterstützt nicht nur die offizielle OpenAI-API, sondern auch beliebige OpenAI-kompatible Endpunkte – darunter aggregierende Modellanbieter wie OpenRouter.

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
          "modalities": {
            "image": true
          },
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

### Lokale selbstgehostete Modelle (über OpenAI-kompatible API)

Die meisten lokalen Inferenzserver (vLLM, Ollama, LM Studio usw.) stellen einen OpenAI-kompatiblen API-Endpunkt bereit. Konfigurieren Sie diese mithilfe des Authentifizierungstyps `openai` und einer lokalen `baseUrl`:

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
        "name": "Lokales Modell (LM Studio)",
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

# Für Ollama (keine Authentifizierung erforderlich)
export OLLAMA_API_KEY="ollama"

# Für vLLM (falls keine Authentifizierung konfiguriert ist)
export VLLM_API_KEY="nicht-erforderlich"
```

> [!note]
>
> Der Parameter `extra_body` wird **ausschließlich von OpenAI-kompatiblen Anbietern** (`openai`, `qwen-oauth`) unterstützt. Er wird von Anthropic- und Gemini-Anbietern ignoriert.

## Alibaba Cloud Coding Plan

Der Alibaba Cloud Coding Plan bietet eine vorkonfigurierte Auswahl an Qwen-Modellen, die speziell für Programmieraufgaben optimiert sind. Diese Funktion steht Nutzern mit Zugriff auf die Alibaba Cloud Coding Plan-API zur Verfügung und bietet eine vereinfachte Einrichtung mit automatischen Aktualisierungen der Modellkonfiguration.

### Übersicht

Wenn Sie sich mit einem Alibaba Cloud Coding Plan-API-Schlüssel über den Befehl `/auth` authentifizieren, konfiguriert Qwen Code automatisch die folgenden Modelle:

| Modell-ID               | Name                 | Beschreibung                            |
| ----------------------- | -------------------- | --------------------------------------- |
| `qwen3.5-plus`          | qwen3.5-plus         | Fortgeschrittenes Modell mit aktivierter Denkfunktion   |
| `qwen3-coder-plus`      | qwen3-coder-plus     | Für Programmieraufgaben optimiert             |
| `qwen3-max-2026-01-23`  | qwen3-max-2026-01-23 | Neuestes „max“-Modell mit aktivierter Denkfunktion |

### Einrichtung

1. Beschaffen Sie einen Alibaba Cloud Coding Plan-API-Schlüssel:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Führen Sie den Befehl `/auth` in Qwen Code aus.
3. Wählen Sie **Alibaba Cloud Coding Plan**.
4. Wählen Sie Ihre Region.
5. Geben Sie Ihren API-Schlüssel bei entsprechender Aufforderung ein.

Die Modelle werden automatisch konfiguriert und Ihrem `/model`-Auswahlmenü hinzugefügt.

### Regionen

Der Alibaba Cloud Coding Plan unterstützt zwei Regionen:

| Region               | Endpunkt                                        | Beschreibung                     |
| -------------------- | ----------------------------------------------- | ---------------------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpunkt für das chinesische Festland |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Internationaler Endpunkt         |

Die Region wird während der Authentifizierung ausgewählt und in `settings.json` unter `codingPlan.region` gespeichert. Um die Region zu wechseln, führen Sie den Befehl `/auth` erneut aus und wählen eine andere Region aus.

### Speicherung des API-Schlüssels

Wenn Sie den Coding-Plan über den Befehl `/auth` konfigurieren, wird der API-Schlüssel unter dem reservierten Umgebungsvariablennamen `BAILIAN_CODING_PLAN_API_KEY` gespeichert. Standardmäßig wird er im Feld `env` Ihrer Datei `settings.json` abgelegt.

> [!warning]
>
> **Sicherheitsempfehlung**: Aus Sicherheitsgründen empfiehlt es sich, den API-Schlüssel aus der Datei `settings.json` in eine separate Datei `.env` zu verschieben und ihn als Umgebungsvariable zu laden. Beispiel:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=Ihr-API-Schlüssel-hier
> ```
>
> Stellen Sie sicher, dass diese Datei zu Ihrer `.gitignore` hinzugefügt wird, falls Sie projektspezifische Einstellungen verwenden.

### Automatische Updates

Die Konfigurationen des Coding-Plan-Modells sind versionsbasiert. Sobald Qwen Code eine neuere Version der Modellvorlage erkennt, werden Sie zur Aktualisierung aufgefordert. Wenn Sie die Aktualisierung akzeptieren, wird Folgendes ausgeführt:

- Die vorhandenen Coding-Plan-Modellkonfigurationen werden durch die neuesten Versionen ersetzt.
- Alle manuell hinzugefügten benutzerdefinierten Modellkonfigurationen bleiben erhalten.
- Automatisch wird zum ersten Modell in der aktualisierten Konfiguration gewechselt.

Der Aktualisierungsprozess stellt sicher, dass Sie stets Zugriff auf die neuesten Modellkonfigurationen und Funktionen haben – ohne manuellen Eingriff.

### Manuelle Konfiguration (Fortgeschritten)

Falls Sie Coding-Plan-Modelle lieber manuell konfigurieren möchten, können Sie sie wie jeden OpenAI-kompatiblen Anbieter zu Ihrer `settings.json` hinzufügen:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "description": "Qwen3-Coder über den Alibaba Cloud Coding Plan",
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
> - Sie können für `envKey` einen beliebigen Namen für die Umgebungsvariable verwenden.
> - Die Konfiguration von `codingPlan.*` ist nicht erforderlich.
> - **Automatische Updates werden auf manuell konfigurierte Coding-Plan-Modelle nicht angewendet.**

> [!warning]
>
> Falls Sie zusätzlich zur manuellen Konfiguration auch die automatische Coding-Plan-Konfiguration nutzen, können automatische Updates Ihre manuelle Konfiguration überschreiben, sofern dieselben Werte für `envKey` und `baseUrl` wie bei der automatischen Konfiguration verwendet werden. Um dies zu vermeiden, stellen Sie sicher, dass Ihre manuelle Konfiguration – wenn möglich – einen anderen `envKey` verwendet.

## Auflösungsebenen und Atomarität

Die wirksamen Werte für Authentifizierung, Modell und Anmeldeinformationen werden pro Feld gemäß der folgenden Rangfolge ausgewählt (die erste vorhandene Angabe gewinnt). Sie können `--auth-type` mit `--model` kombinieren, um direkt auf einen Anbieter-Eintrag zu verweisen; diese CLI-Flags werden vor anderen Ebenen ausgeführt.

| Ebene (höchste → niedrigste) | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| ---------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatische Überschreibungen | `/auth`                             | `/auth`-Eingabe                                 | `/auth`-Eingabe                                     | `/auth`-Eingabe                                        | —                      | —                                 |
| Modellanbieter-Auswahl       | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI-Argumente                | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (oder anbieterspezifische Äquivalente) | `--openaiBaseUrl` (oder anbieterspezifische Äquivalente) | —                      | —                                 |
| Umgebungsvariablen           | —                                   | Anbieterspezifische Zuordnung (z. B. `OPENAI_MODEL`) | Anbieterspezifische Zuordnung (z. B. `OPENAI_API_KEY`)   | Anbieterspezifische Zuordnung (z. B. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Einstellungen (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Standard-/berechnete Werte | Fallback auf `AuthType.QWEN_OAUTH` | Integrierter Standard (OpenAI ⇒ `qwen3-coder-plus`) | —                                                   | —                                                    | —                      | `Config.getProxy()`, falls konfiguriert |

\*Sofern vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmt `security.auth.selectedType` oder der implizite Standard den Authentifizierungstyp. Qwen OAuth und OpenAI sind die einzigen Authentifizierungstypen, die ohne zusätzliche Konfiguration verfügbar sind.

> [!warning]
>
> **Veraltung von `security.auth.apiKey` und `security.auth.baseUrl`:** Die direkte Konfiguration von API-Anmeldeinformationen über `security.auth.apiKey` und `security.auth.baseUrl` in `settings.json` ist veraltet. Diese Einstellungen wurden in früheren Versionen für über die Benutzeroberfläche eingegebene Anmeldeinformationen verwendet, doch der Eingabefluss für Anmeldeinformationen wurde in Version 0.10.1 entfernt. Diese Felder werden in einer zukünftigen Version vollständig entfernt. **Es wird dringend empfohlen, für alle Modell- und Anmeldeinformationskonfigurationen auf `modelProviders` umzusteigen.** Verwenden Sie `envKey` innerhalb von `modelProviders`, um auf Umgebungsvariablen für ein sicheres Anmeldeinformationsmanagement zu verweisen, statt Anmeldeinformationen in Einstellungsdateien festzucodieren.

## Generierungskonfigurations-Überlagerung: Die undurchdringbare Anbieter-Schicht

Die Konfigurationsauflösung folgt einem strengen Schichtenmodell mit einer entscheidenden Regel: **Die `modelProvider`-Schicht ist undurchdringbar.**

### So funktioniert es

1. **Wenn ein Modell eines `modelProvider` ausgewählt ist** (z. B. über den Befehl `/model`, um ein vom Anbieter konfiguriertes Modell zu wählen):
   - Die gesamte `generationConfig` des Anbieters wird **atomar** angewendet.
   - **Die Anbieter-Ebene ist vollständig undurchlässig** – niedrigere Ebenen (CLI, Umgebungsvariablen, Einstellungen) sind bei der Auflösung von `generationConfig` überhaupt nicht beteiligt.
   - Alle in `modelProviders[].generationConfig` definierten Felder verwenden die Werte des Anbieters.
   - Alle Felder, die **vom Anbieter nicht definiert** sind, erhalten den Wert `undefined` (sie werden nicht aus den Einstellungen geerbt).
   - Dadurch wird sichergestellt, dass Konfigurationen von Anbietern als vollständiges, eigenständiges „versiegeltes Paket“ wirken.

2. **Wenn KEIN Modell eines `modelProvider` ausgewählt ist** (z. B. bei Verwendung von `--model` mit einer reinen Modell-ID oder bei direkter Nutzung von CLI/Umgabenvariablen/Einstellungen):
   - Die Auflösung erfolgt schrittweise über die niedrigeren Ebenen.
   - Felder werden in der Reihenfolge CLI → Umgebungsvariablen → Einstellungen → Standardwerte gefüllt.
   - Dadurch entsteht ein **Runtime-Modell** (siehe nächsten Abschnitt).

### Priorität pro Feld für `generationConfig`

| Priorität | Quelle                                                | Verhalten                                                                                                                              |
| --------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Programmatische Überschreibungen                      | Laufzeit-Änderungen über `/model` und `/auth`                                                                                           |
| 2         | `modelProviders[authType][].generationConfig`        | **Undurchlässige Ebene** – ersetzt sämtliche Felder von `generationConfig` vollständig; darunterliegende Ebenen werden nicht berücksichtigt |
| 3         | `settings.model.generationConfig`                     | Wird nur für **Laufzeitmodelle** verwendet (wenn kein Anbietermodell ausgewählt ist)                                                  |
| 4         | Standardwerte des Inhalts-Generators                  | Anbieterspezifische Standardwerte (z. B. OpenAI vs. Gemini) – nur für Laufzeitmodelle                                                  |

### Behandlung atomarer Felder

Die folgenden Felder werden als atomare Objekte behandelt – Anbieterwerte ersetzen das gesamte Objekt vollständig; es erfolgt keine Zusammenführung:

- `samplingParams` – Temperatur, `top_p`, `max_tokens` usw.
- `customHeaders` – Benutzerdefinierte HTTP-Header
- `extra_body` – Zusätzliche Parameter für den Anfragetext

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

// Konfiguration für modelProviders
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

Wenn `gpt-4o` aus `modelProviders` ausgewählt wird:

- `timeout` = 60000 (aus dem Anbieter, überschreibt die Einstellungen)
- `samplingParams.temperature` = 0.2 (aus dem Anbieter, ersetzt das gesamte `samplingParams`-Objekt vollständig)
- `samplingParams.max_tokens` = **undefined** (nicht im Anbieter definiert; die Anbieter-Ebene erbt nicht von den Einstellungen – Felder werden explizit auf `undefined` gesetzt, falls sie nicht angegeben sind)

Bei Verwendung eines „rohen“ Modells über `--model gpt-4` (nicht aus `modelProviders`, erstellt ein Laufzeitmodell):

- `timeout` = 30000 (aus den Einstellungen)
- `samplingParams.temperature` = 0.5 (aus den Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus den Einstellungen)

Die Zusammenführungsstrategie für `modelProviders` selbst lautet ERSETZEN: Der gesamte Abschnitt `modelProviders` aus den Projekteinstellungen überschreibt den entsprechenden Abschnitt in den Benutzereinstellungen vollständig, anstatt beide zu mergen.

## Anbietermodelle vs. Laufzeitmodelle

Qwen Code unterscheidet zwischen zwei Arten von Modellkonfigurationen:

### Anbietermodell

- Definiert in der `modelProviders`-Konfiguration  
- Enthält ein vollständiges, atomares Konfigurationspaket  
- Bei Auswahl wird dessen Konfiguration als undurchdringliche Schicht angewendet  
- Wird in der Befehlsliste `/model` mit vollständigen Metadaten (Name, Beschreibung, Funktionen) angezeigt  
- Empfohlen für Workflows mit mehreren Modellen und zur Sicherstellung der Konsistenz im Team  

### Laufzeitmodell

- Wird dynamisch erstellt, wenn rohe Modell-IDs über die CLI (`--model`), Umgebungsvariablen oder Einstellungen verwendet werden  
- Nicht in `modelProviders` definiert  
- Die Konfiguration wird durch „Projektion“ über Auflösungsebenen erstellt (CLI → Umgebungsvariable → Einstellungen → Standardwerte)  
- Wird automatisch als **RuntimeModelSnapshot** erfasst, sobald eine vollständige Konfiguration erkannt wird  
- Ermöglicht die Wiederverwendung ohne erneute Eingabe von Anmeldeinformationen

### Lebenszyklus von RuntimeModelSnapshot

Wenn Sie ein Modell konfigurieren, ohne `modelProviders` zu verwenden, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um Ihre Konfiguration zu speichern:

```bash

# Dies erstellt einen RuntimeModelSnapshot mit der ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Der Snapshot:

- Erfasst die Modell-ID, den API-Schlüssel, die Basis-URL und die Generierungskonfiguration
- Bleibt über Sitzungen hinweg erhalten (wird während der Laufzeit im Arbeitsspeicher gespeichert)
- Wird in der Liste des `/model`-Befehls als Laufzeitoption angezeigt
- Kann mithilfe von `/model $runtime|openai|my-custom-model` aktiviert werden

### Wichtige Unterschiede

| Aspekt                  | Anbietermodell                    | Laufzeitmodell                             |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Konfigurationsquelle    | `modelProviders` in den Einstellungen | CLI, Umgebungsvariablen, Einstellungsebenen |
| Konfigurationsatomarität | Vollständiges, undurchdringliches Paket | Geschichtet: Jedes Feld wird unabhängig aufgelöst |
| Wiederverwendbarkeit    | Immer in der `/model`-Liste verfügbar | Als Momentaufnahme erfasst; erscheint nur, wenn vollständig |
| Teamfreigabe            | Ja (über committete Einstellungen) | Nein (nutzerspezifisch)                    |
| Speicherung von Anmeldeinformationen | Nur als Verweis über `envKey` | Kann den tatsächlichen Schlüssel in der Momentaufnahme enthalten |

### Wann welches Modell verwenden?

- **Verwenden Sie Provider-Modelle**, wenn: Sie Standardmodelle haben, die von einem Team gemeinsam genutzt werden, konsistente Konfigurationen benötigen oder versehentliche Überschreibungen vermeiden möchten.
- **Verwenden Sie Runtime-Modelle**, wenn: Sie schnell ein neues Modell testen, temporäre Anmeldeinformationen verwenden oder mit Ad-hoc-Endpunkten arbeiten.

## Persistenz der Auswahl und Empfehlungen

> [!important]
>
> Definieren Sie `modelProviders` stets im benutzerspezifischen Bereich in `~/.qwen/settings.json`, sofern möglich, und vermeiden Sie es, Anmeldeinformationen-Überschreibungen in irgendeinem Bereich dauerhaft zu speichern. Durch die Aufnahme des Anbieterkatalogs in den Benutzereinstellungen werden Konflikte durch Zusammenführung oder Überschreibung zwischen Projekt- und Benutzerbereich vermieden, und es ist sichergestellt, dass Aktualisierungen über `/auth` und `/model` stets in einen konsistenten Bereich zurückgeschrieben werden.

- `/model` und `/auth` speichern `model.name` (sofern zutreffend) sowie `security.auth.selectedType` im nächstgelegenen beschreibbaren Bereich, der bereits `modelProviders` definiert; andernfalls erfolgt die Speicherung im Benutzerbereich. Dadurch bleiben Arbeitsbereichs- und Benutzerdateien mit dem aktiven Anbieterkatalog synchronisiert.
- Ohne `modelProviders` kombiniert der Resolver die Ebenen CLI/Umweltvariablen/Einstellungen und erzeugt so *Runtime Models*. Dies ist bei Einzelanbieter-Setups akzeptabel, jedoch umständlich, wenn häufig zwischen Anbietern gewechselt wird. Definieren Sie Anbieterkataloge stets dann, wenn Workflows mit mehreren Modellen üblich sind, damit Wechsel atomar, quellattributiert und fehlerdiagnosefähig bleiben.