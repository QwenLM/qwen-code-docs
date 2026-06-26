# Model Providers

Qwen Code ermöglicht es Ihnen, mehrere Modellanbieter über die Einstellung `modelProviders` in Ihrer `settings.json` zu konfigurieren. Dadurch können Sie mit dem Befehl `/model` zwischen verschiedenen KI-Modellen und Anbietern wechseln.

## Übersicht

Verwenden Sie `modelProviders`, um Modelle pro Authentifizierungstyp zu deklarieren, zwischen denen der `/model`-Picker wechseln kann. Schlüssel müssen gültige Authentifizierungstypen sein (`openai`, `anthropic`, `gemini`, usw.). Jeder Authentifizierungstyp wird auf ein `ProviderConfig`-Objekt mit einem `protocol`-Feld und einem `models`-Feld (dem Array der Modelldefinitionen) abgebildet. Jeder Eintrag in `models` erfordert eine `id`; `envKey` ist **optional und empfohlen** (wenn weggelassen, wird auf den Standard-Umgebungsvariablenschlüssel des Authentifizierungstyps zurückgegriffen, z. B. `OPENAI_API_KEY` für `openai`), mit optionalen `name`, `description`, `baseUrl` und `generationConfig`. Anmeldeinformationen werden nie in den Einstellungen gespeichert; die Laufzeitumgebung liest sie aus `process.env[envKey]`. Qwen OAuth-Modelle bleiben fest kodiert und können nicht überschrieben werden.

> [!note]
>
> Nur der Befehl `/model` zeigt nicht-standardmäßige Authentifizierungstypen an. Anthropic, Gemini usw. müssen über `modelProviders` definiert werden. Der Befehl `/auth` listet drei Optionen der obersten Ebene auf: **Alibaba ModelStudio** (mit Coding Plan, Token Plan und Standard API Key in dessen Untermenü), **Third-party Providers** und **Custom Provider**. (Qwen OAuth ist kein auswählbarer Dialogeintrag mehr; dessen kostenlose Stufe wurde am 15.04.2026 eingestellt.)

> [!note]
>
> **Eindeutigkeit der Modelle:** Modelle innerhalb desselben `authType` werden durch die Kombination von `id` + `baseUrl` eindeutig identifiziert. Das bedeutet, Sie können die gleiche Modell-ID (z. B. `"gpt-4o"`) mehrmals unter einem einzigen `authType` definieren, solange jeder Eintrag eine andere `baseUrl` hat – zum Beispiel einer, der direkt auf OpenAI zeigt, und ein anderer auf einen Proxy-Endpunkt. Wenn zwei Einträge sowohl die gleiche `id` als auch die gleiche `baseUrl` haben (oder beide `baseUrl` weglassen), gewinnt der erste Vorkommnis und nachfolgende Duplikate werden mit einer Warnung übersprungen.

## Konfigurationsbeispiele nach Authentifizierungstyp

Im Folgenden finden Sie umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen, die die verfügbaren Parameter und deren Kombinationen zeigen.

### Unterstützte Authentifizierungstypen

Die Schlüssel des Objekts `modelProviders` müssen gültige `authType`-Werte sein. Derzeit unterstützte Authentifizierungstypen:

| Auth Type    | Beschreibung                                                                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI-kompatible APIs (OpenAI, Azure OpenAI, lokale Inferenzserver wie vLLM/Ollama)                                                               |
| `anthropic`  | Anthropic Claude API                                                                                                                               |
| `gemini`     | Google Gemini API                                                                                                                                  |
| `qwen-oauth` | Qwen OAuth (fest kodiert, kann in `modelProviders` nicht überschrieben werden)                                                                     |
| `vertex-ai`  | Google Vertex AI (verwendet das `gemini`-Protokoll und das `@google/genai`-SDK im Vertex AI-Modus; bei Auswahl wird `GOOGLE_GENAI_USE_VERTEXAI=true` gesetzt) |

> [!warning]
> Wenn ein unbekannter Authentifizierungstypschlüssel verwendet wird (z. B. ein Tippfehler wie `"openai-custom"`), wird ein nicht leerer Schlüssel als eigene auth-type-Gruppe akzeptiert, jedoch keinem bekannten Protokoll zugeordnet – die Modelle funktionieren daher nicht wie vorgesehen und verhalten sich im `/model`-Picker nicht korrekt. Nur leere (nur Leerzeichen enthaltende) Schlüssel werden übersprungen. Verwenden Sie immer einen der oben aufgeführten unterstützten Authentifizierungstypwerte.

### Für API-Anfragen verwendete SDKs

Qwen Code verwendet die folgenden offiziellen SDKs, um Anfragen an jeden Anbieter zu senden:

| Auth Type    | SDK-Paket                                                                                           |
| ------------ | --------------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) – Offizielles OpenAI Node.js SDK                   |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) – Offizielles Anthropic SDK  |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) – Offizielles Google GenAI SDK       |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) mit benutzerdefiniertem Anbieter (DashScope-kompatibel) |

Das bedeutet, dass die von Ihnen konfigurierte `baseUrl` mit dem erwarteten API-Format des entsprechenden SDKs kompatibel sein sollte. Bei Verwendung des Authentifizierungstyps `openai` muss der Endpunkt beispielsweise API-Anfragen im OpenAI-Format akzeptieren.

### OpenAI-kompatible Anbieter (`openai`)

Dieser Authentifizierungstyp unterstützt nicht nur die offizielle OpenAI-API, sondern auch jeden OpenAI-kompatiblen Endpunkt, einschließlich aggregierter Modellanbieter wie OpenRouter und Requesty.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here",
    "REQUESTY_API_KEY": "sk-your-actual-requesty-key-here"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
          "name": "GPT-4o (via OpenRouter)",
          "envKey": "OPENROUTER_API_KEY",
          "baseUrl": "https://openrouter.ai/api/v1",
          "generationConfig": {
            "timeout": 120000,
            "maxRetries": 3,
            "samplingParams": {
              "temperature": 0.7
            }
          }
        },
        {
          "id": "openai/gpt-4o-mini",
          "name": "GPT-4o Mini (via Requesty)",
          "envKey": "REQUESTY_API_KEY",
          "baseUrl": "https://router.requesty.ai/v1",
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
}
```

### Anthropic (`anthropic`)

```json
{
  "env": {
    "ANTHROPIC_API_KEY": "sk-ant-your-actual-anthropic-key-here"
  },
  "modelProviders": {
    "anthropic": {
      "protocol": "anthropic",
      "models": [
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
}
```

### Google Gemini (`gemini`)

```json
{
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
  "modelProviders": {
    "gemini": {
      "protocol": "gemini",
      "models": [
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
}
```

### Lokale Self-Hosted-Modelle (über OpenAI-kompatible API)

Die meisten lokalen Inferenzserver (vLLM, Ollama, LM Studio usw.) bieten einen OpenAI-kompatiblen API-Endpunkt. Konfigurieren Sie diese mit dem Authentifizierungstyp `openai` und einer lokalen `baseUrl`:

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

Für lokale Server, die keine Authentifizierung erfordern, können Sie jeden Platzhalterwert für den API-Schlüssel verwenden:

```bash
# Für Ollama (keine Authentifizierung erforderlich)
export OLLAMA_API_KEY="ollama"

# Für vLLM (falls keine Authentifizierung konfiguriert ist)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Der Parameter `extra_body` wird **nur für OpenAI-kompatible Anbieter** (`openai`, `qwen-oauth`) unterstützt. Er wird für Anthropic- und Gemini-Anbieter ignoriert.

> [!note]
>
> **Über `envKey`**: Das Feld `envKey` gibt den **Namen einer Umgebungsvariablen** an, nicht den tatsächlichen API-Schlüsselwert. Damit die Konfiguration funktioniert, müssen Sie sicherstellen, dass die entsprechende Umgebungsvariable mit Ihrem tatsächlichen API-Schlüssel gesetzt ist. Es gibt zwei Möglichkeiten, dies zu tun:
>
> - **Option 1: Verwenden einer `.env`-Datei** (aus Sicherheitsgründen empfohlen):
>   ```bash
>   # ~/.qwen/.env (oder Projektstamm)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Stellen Sie sicher, dass Sie `.env` zu Ihrer `.gitignore` hinzufügen, um ein versehentliches Einchecken von Geheimnissen zu verhindern.
> - **Option 2: Verwenden des `env`-Felds in `settings.json`** (wie in den obigen Beispielen gezeigt):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Jedes Anbieterbeispiel enthält ein `env`-Feld, um zu veranschaulichen, wie der API-Schlüssel konfiguriert werden sollte.

## Alibaba Cloud Coding Plan

Der Alibaba Cloud Coding Plan bietet eine vorkonfigurierte Reihe von Qwen-Modellen, die für Codierungsaufgaben optimiert sind. Diese Funktion steht Benutzern mit API-Zugriff auf den Alibaba Cloud Coding Plan zur Verfügung und bietet eine vereinfachte Einrichtung mit automatischen Modellkonfigurationsaktualisierungen.

### Übersicht

Wenn Sie sich mit einem Alibaba Cloud Coding Plan API-Schlüssel über den Befehl `/auth` authentifizieren, konfiguriert Qwen Code automatisch die folgenden Modelle:

| Modell-ID              | Name                 | Beschreibung                                                |
| ---------------------- | -------------------- | ----------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Erweitertes Modell mit aktiviertem Thinking                 |
| `qwen3.6-plus`         | qwen3.6-plus         | Neuestes Modell mit aktiviertem Thinking (nur Pro-Abonnenten)|
| `qwen3.7-plus`         | qwen3.7-plus         | Erweitertes Modell mit aktiviertem Thinking                 |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Optimiert für Codierungsaufgaben                            |
| `qwen3-coder-next`     | qwen3-coder-next     | Experimentelles Codierungsmodell                            |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Neuestes Max-Modell mit aktiviertem Thinking                |
| `glm-5`                | glm-5                | GLM-Modell mit aktiviertem Thinking                         |
| `glm-4.7`              | glm-4.7              | GLM-Modell mit aktiviertem Thinking                         |
| `kimi-k2.5`            | kimi-k2.5            | Kimi-Modell mit Thinking- und Vision/Video-Unterstützung    |
| `MiniMax-M2.5`         | MiniMax-M2.5         | MiniMax-Modell mit aktiviertem Thinking                     |

### Einrichtung

1. Besorgen Sie sich einen Alibaba Cloud Coding Plan API-Schlüssel:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Führen Sie den Befehl `/auth` in Qwen Code aus
3. Wählen Sie **Alibaba ModelStudio**, dann im Untermenü **Coding Plan**
4. Wählen Sie Ihre Region
5. Geben Sie Ihren API-Schlüssel ein, wenn Sie dazu aufgefordert werden

Die Modelle werden automatisch konfiguriert und zu Ihrem `/model`-Picker hinzugefügt.

### Regionen

Der Alibaba Cloud Coding Plan unterstützt zwei Regionen:

| Region               | Endpunkt                                         | Beschreibung                    |
| -------------------- | ------------------------------------------------ | ------------------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`       | Endpunkt für das chinesische Festland |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Internationaler Endpunkt        |

Die Region wird während der Authentifizierung ausgewählt und in `settings.json` unter der Konfiguration `modelProviders` gespeichert. Um die Region zu wechseln, führen Sie den Befehl `/auth` erneut aus und wählen Sie eine andere Region.

### API-Schlüsselspeicherung

Wenn Sie den Coding Plan über den Befehl `/auth` konfigurieren, wird der API-Schlüssel unter dem reservierten Umgebungsvariablennamen `BAILIAN_CODING_PLAN_API_KEY` gespeichert. Standardmäßig wird er im `env`-Feld Ihrer `settings.json`-Datei gespeichert.

> [!warning]
>
> **Sicherheitsempfehlung**: Aus Sicherheitsgründen wird empfohlen, den API-Schlüssel aus `settings.json` in eine separate `.env`-Datei zu verschieben und als Umgebungsvariable zu laden. Beispiel:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Stellen Sie dann sicher, dass diese Datei zu Ihrer `.gitignore` hinzugefügt wird, wenn Sie projektebene Einstellungen verwenden.

### Automatische Aktualisierungen

Coding Plan-Modellkonfigurationen sind versioniert. Wenn Qwen Code eine neuere Version der Modellvorlage erkennt, werden Sie zur Aktualisierung aufgefordert. Wenn Sie die Aktualisierung annehmen, geschieht Folgendes:

- Die vorhandenen Coding Plan-Modellkonfigurationen werden durch die neuesten Versionen ersetzt
- Alle manuell hinzugefügten benutzerdefinierten Modellkonfigurationen bleiben erhalten
- Es wird automatisch zum ersten Modell in der aktualisierten Konfiguration gewechselt

Der Aktualisierungsprozess stellt sicher, dass Sie ohne manuelles Eingreifen immer Zugriff auf die neuesten Modellkonfigurationen und -funktionen haben.

### Manuelle Konfiguration (Erweitert)

Wenn Sie Coding Plan-Modelle lieber manuell konfigurieren möchten, können Sie sie wie jeden OpenAI-kompatiblen Anbieter zu Ihrer `settings.json` hinzufügen:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "description": "Qwen3-Coder via Alibaba Cloud Coding Plan",
          "envKey": "YOUR_CUSTOM_ENV_KEY",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1"
        }
      ]
    }
  }
}
```

> [!note]
>
> Bei manueller Konfiguration:
>
> - Sie können jeden beliebigen Umgebungsvariablennamen für `envKey` verwenden
> - Sie müssen `codingPlan.*` nicht konfigurieren
> - **Automatische Aktualisierungen werden nicht** auf manuell konfigurierte Coding Plan-Modelle angewendet

> [!warning]
>
> Wenn Sie auch die automatische Coding Plan-Konfiguration verwenden, können automatische Aktualisierungen Ihre manuellen Konfigurationen überschreiben, wenn diese denselben `envKey` und dieselbe `baseUrl` wie die automatische Konfiguration verwenden. Um dies zu vermeiden, stellen Sie sicher, dass Ihre manuelle Konfiguration nach Möglichkeit einen anderen `envKey` verwendet.

## Auflösungsebenen und Atomizität

Die effektiven Werte für auth/model/credential werden pro Feld nach folgender Priorität ausgewählt (erster Treffer gewinnt). Sie können `--auth-type` mit `--model` kombinieren, um direkt auf einen Anbietereintrag zu verweisen; diese CLI-Flags werden vor anderen Ebenen ausgeführt.

| Ebene (höchste → niedrigste) | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| ---------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Programmatische Überschreibungen | `/auth`                         | `/auth`-Eingabe                                 | `/auth`-Eingabe                                       | `/auth`-Eingabe                                        | —                      | —                                 |
| Modellanbieternauswahl        | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| CLI-Argumente                 | `--auth-type`                       | `--model`                                       | `--openai-api-key` (oder anbieterspezifische Äquivalente) | `--openai-base-url` (oder anbieterspezifische Äquivalente) | —                      | —                                 |
| Umgebungsvariablen            | —                                   | Anbieterspezifisches Mapping (z. B. `OPENAI_MODEL`) | Anbieterspezifisches Mapping (z. B. `OPENAI_API_KEY`) | Anbieterspezifisches Mapping (z. B. `OPENAI_BASE_URL`) | —                      | —                                 |
| Einstellungen (`settings.json`) | `security.auth.selectedType`      | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| Standard / berechnet          | Fallback auf `AuthType.QWEN_OAUTH` | Eingebauter Standard (OpenAI ⇒ `qwen3.5-plus`) | —                                                     | —                                                      | —                      | `Config.getProxy()` falls konfiguriert |
\*CLI-Auth-Flags überschreiben, falls vorhanden, die Einstellungen. Andernfalls bestimmen `security.auth.selectedType` oder der implizite Standard den Auth-Typ. Qwen OAuth und OpenAI sind die einzigen Auth-Typen, die ohne zusätzliche Konfiguration sichtbar sind.

> [!warning]
>
> **Veraltung von `security.auth.apiKey` und `security.auth.baseUrl`:** Die direkte Konfiguration von API-Zugangsdaten über `security.auth.apiKey` und `security.auth.baseUrl` in `settings.json` ist veraltet. Diese Einstellungen wurden in früheren Versionen für über die Benutzeroberfläche eingegebene Zugangsdaten verwendet, aber der Eingabefluss für Zugangsdaten wurde in Version 0.10.1 entfernt. Diese Felder werden in einer zukünftigen Version vollständig entfernt. **Es wird dringend empfohlen, auf `modelProviders` umzusteigen** für alle Modell- und Zugangsdatenkonfigurationen. Verwenden Sie `envKey` in `modelProviders`, um Umgebungsvariablen für die sichere Verwaltung von Zugangsdaten zu referenzieren, anstatt Zugangsdaten direkt in Einstellungsdateien zu hinterlegen.

## Konfigurationsschichtung der Generierung: Die undurchlässige Provider-Ebene

Die Konfigurationsauflösung folgt einem strengen Schichtenmodell mit einer entscheidenden Regel: **Die modelProvider-Ebene ist undurchlässig**.

### So funktioniert es

1. **Wenn ein modelProvider-Modell AUSGEWÄHLT ist** (z. B. über den Befehl `/model`, der ein per Provider konfiguriertes Modell auswählt):
   - Die gesamte `generationConfig` des Providers wird **atomar** angewendet
   - **Die Provider-Ebene ist vollständig undurchlässig** – niedrigere Ebenen (CLI, Umgebung, Einstellungen) nehmen an der Auflösung von generationConfig gar nicht teil
   - Alle in `modelProviders[].generationConfig` definierten Felder verwenden die Werte des Providers
   - Alle **nicht vom Provider definierten** Felder werden auf `undefined` gesetzt (nicht von den Einstellungen geerbt)
   - Dies stellt sicher, dass Provider-Konfigurationen als vollständiges, in sich geschlossenes „versiegeltes Paket“ wirken

   Wenn ein Modell in `modelProviders` aufgeführt ist, legen Sie alle modellspezifischen
   Generierungseinstellungen für dieses Modell im entsprechenden Provider-Eintrag ab. Werte der obersten Ebene
   `model.generationConfig`, einschließlich `contextWindowSize`,
   `modalities`, `customHeaders` und `extra_body`, werden für Provider-Modelle ignoriert.
   Konfigurieren Sie diese Felder unter
   `modelProviders[authType][].generationConfig`, damit sie angewendet werden.

2. **Wenn KEIN modelProvider-Modell ausgewählt ist** (z. B. bei Verwendung von `--model` mit einer rohen Modell-ID oder bei direkter Verwendung von CLI/Umgebung/Einstellungen):
   - Die Auflösung fällt auf die unteren Ebenen zurück
   - Felder werden aus CLI → Umgebung → Einstellungen → Standardwerten befüllt
   - Dies erzeugt ein **Runtime Model** (siehe nächster Abschnitt)

### Rangfolge pro Feld für `generationConfig`

| Priorität | Quelle                                       | Verhalten                                                                                                                                |
| --------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1         | Programmatische Überschreibungen             | Laufzeit-`/model`, `/auth` Änderungen                                                                                                    |
| 2         | `modelProviders[authType][].generationConfig` | **Undurchlässige Ebene** – ersetzt alle generationConfig-Felder vollständig; untere Ebenen nehmen nicht teil                             |
| 3         | `settings.model.generationConfig`            | Wird nur für **Runtime Models** verwendet (wenn kein Provider-Modell ausgewählt ist)                                                     |
| 4         | Standardwerte des Content-Generators         | Anbieterspezifische Standardwerte (z. B. OpenAI vs. Gemini) – nur für Runtime Models                                                     |

### Atomare Feldbehandlung

Die folgenden Felder werden als atomare Objekte behandelt – Provider-Werte ersetzen das gesamte Objekt vollständig, es findet keine Zusammenführung statt:

- `samplingParams` – Temperatur, top_p, max_tokens, etc.
- `customHeaders` – Benutzerdefinierte HTTP-Header
- `extra_body` – Zusätzliche Anforderungsparameter

### Beispiel

```jsonc
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
    "openai": {
      "protocol": "openai",
      "models": [{
        "id": "gpt-4o",
        "envKey": "OPENAI_API_KEY",
        "generationConfig": {
          "timeout": 60000,
          "samplingParams": { "temperature": 0.2 }
        }
      }]
    }
  }
}
```

Wenn `gpt-4o` aus modelProviders ausgewählt wird:

- `timeout` = 60000 (vom Provider, überschreibt Einstellungen)
- `samplingParams.temperature` = 0.2 (vom Provider, ersetzt das Einstellungsobjekt vollständig)
- `samplingParams.max_tokens` = **undefined** (nicht im Provider definiert, und die Provider-Ebene erbt nicht von den Einstellungen – Felder werden explizit auf undefined gesetzt, wenn nicht angegeben)

Bei Verwendung eines rohen Modells über `--model gpt-4` (nicht aus modelProviders, erzeugt ein Runtime Model):

- `timeout` = 30000 (aus Einstellungen)
- `samplingParams.temperature` = 0.5 (aus Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus Einstellungen)

Die Zusammenführungsstrategie für `modelProviders` selbst ist ERSETZEN: die gesamten `modelProviders` aus den Projekteinstellungen überschreiben den entsprechenden Abschnitt in den Benutzereinstellungen, anstatt sie zusammenzuführen.

## Reasoning-/Thinking-Konfiguration

Das optionale Feld `reasoning` unter `generationConfig` steuert, wie stark das Modell vor der Antwort nachdenkt. Die Anthropic- und Gemini-Konverter beachten es immer. Die OpenAI-kompatible Pipeline beachtet es **es sei denn**, `generationConfig.samplingParams` ist gesetzt – siehe den Hinweis „Interaktion mit `samplingParams`“ unten.

```jsonc
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "deepseek-v4-pro",
          "name": "DeepSeek V4 Pro",
          "baseUrl": "https://api.deepseek.com/v1",
          "envKey": "DEEPSEEK_API_KEY",
          "generationConfig": {
            // Die vierstufige Skala:
            //   'low'    | 'medium' – serverseitig auf 'high' abgebildet bei DeepSeek
            //   'high'   – Standard-Reasoning-Intensität
            //   'max'    – DeepSeek-spezifische extra-starke Stufe
            // Oder setzen Sie `false`, um Reasoning vollständig zu deaktivieren.
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### Verhalten pro Provider

| Protokoll / Provider                       | Drahtformat                                                        | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`) | Flaches `reasoning_effort: <effort>`-Body-Parameter                | Wenn `reasoning.effort` in der verschachtelten Konfigurationsform gesetzt ist, wird es in das flache `reasoning_effort` umgeschrieben und `'low'`/`'medium'` werden auf `'high'`, `'xhigh'` auf `'max'` normalisiert – was DeepSeeks [serverseitiger Abwärtskompatibilität](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) entspricht. Überschreibungen auf oberster Ebene wie `samplingParams.reasoning_effort` oder `extra_body.reasoning_effort` überspringen diese Normalisierung und werden wörtlich gesendet. |
| **OpenAI** (andere kompatible Server)      | `reasoning: { effort, ... }` wird wörtlich durchgereicht           | Über `samplingParams` setzbar (z. B. `samplingParams.reasoning_effort` für GPT-5/o-Serie), wenn der Provider eine andere Form erwartet.                                                                                                                                                                                                                                                                                                                                    |
| **Anthropic** (echtes `api.anthropic.com`) | `output_config: { effort }` plus den `effort-2025-11-24`-Beta-Header | Echte Anthropic akzeptiert nur `'low'`/`'medium'`/`'high'`. `'max'` wird auf `'high'` **geklemmt** mit einer `debugLogger.warn`-Zeile (einmal pro Generator); wenn Sie maximale Anstrengung wünschen, wechseln Sie die baseURL zu einem DeepSeek-kompatiblen Endpunkt, der dies unterstützt.                                                                                                                                                                                   |
| **Anthropic** (`api.deepseek.com/anthropic`) | Gleiches `output_config: { effort }` + Beta-Header                | `'max'` wird unverändert durchgereicht.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Gemini** (`@google/genai`)               | `thinkingConfig: { includeThoughts: true, thinkingLevel }`         | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, andere → `THINKING_LEVEL_UNSPECIFIED` (Gemini hat keine `MAX`-Stufe).                                                                                                                                                                                                                                                                                                                                                         |

### `reasoning: false`

Das Setzen von `reasoning: false` (der wörtliche Boolean) deaktiviert explizit das Nachdenken bei jedem Provider – nützlich für günstige Nebenabfragen, die nicht von Reasoning profitieren. Dies wird auch auf Anfrageebene über `request.config.thinkingConfig.includeThoughts: false` für einmalige Aufrufe (z. B. Vorschlagsgenerierung) beachtet.

Bei einer `api.deepseek.com` baseURL sendet die OpenAI-Pipeline das explizite Feld `thinking: { type: 'disabled' }`, das DeepSeek V4+ benötigt – der serverseitige Standard ist `'enabled'`, daher würde das bloße Weglassen von `reasoning_effort` immer noch Reasoning-Latenz/-Kosten verursachen. Selbstgehostete DeepSeek-Backends (sglang/vllm) und andere OpenAI-kompatible Server **erhalten** dieses Feld nicht; wenn Sie dort das Nachdenken deaktivieren müssen, injizieren Sie `thinking: { type: 'disabled' }` (oder den entsprechenden Schalter Ihres Inferenz-Frameworks) über `samplingParams`/`extra_body`.

### Interaktion mit `samplingParams` (nur OpenAI-kompatibel)

> [!warning]
>
> Wenn `generationConfig.samplingParams` bei einem OpenAI-kompatiblen Provider gesetzt ist, sendet die Pipeline diese Schlüssel **wörtlich** auf die Leitung und überspringt die separate `reasoning`-Injektion vollständig. Eine Konfiguration wie `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` wird das Reasoning-Feld bei OpenAI/DeepSeek-Anfragen daher stillschweigend ignorieren.
>
> Wenn Sie `samplingParams` setzen, fügen Sie den Reasoning-Parameter direkt darin ein – für DeepSeek ist das `samplingParams.reasoning_effort`, für die GPT-5/o-Serie ist es `samplingParams.reasoning_effort` (ihr flaches Feld) oder `samplingParams.reasoning` (das verschachtelte Objekt). Bei OpenRouter und anderen Anbietern variiert der Feldname; konsultieren Sie die Provider-Dokumentation.
>
> Die Anthropic- und Gemini-Konverter sind nicht betroffen – sie lesen `reasoning.effort` unabhängig von `samplingParams` immer direkt.

### `budget_tokens`

Sie können ein genaues Thinking-Token-Budget festlegen, indem Sie `budget_tokens` neben `effort` angeben:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Für Anthropic wird daraus `thinking.budget_tokens`. Für OpenAI/DeepSeek bleibt das Feld erhalten, wird aber derzeit vom Server ignoriert – `reasoning_effort` ist der entscheidende Parameter.

## Provider Models vs. Runtime Models

Qwen Code unterscheidet zwischen zwei Arten von Modellkonfigurationen:

### Provider Model

- Definiert in der `modelProviders`-Konfiguration
- Hat ein vollständiges, atomares Konfigurationspaket
- Bei Auswahl wird seine Konfiguration als undurchlässige Ebene angewendet
- Erscheint in der `/model`-Befehlsliste mit vollständigen Metadaten (Name, Beschreibung, Fähigkeiten)
- Empfohlen für Multi-Model-Workflows und Team-Konsistenz

### Runtime Model

- Wird dynamisch erstellt bei Verwendung roher Modell-IDs über die CLI (`--model`), Umgebungsvariablen oder Einstellungen
- Nicht in `modelProviders` definiert
- Konfiguration wird durch „Projizieren“ durch die Auflösungsebenen (CLI → Umgebung → Einstellungen → Standardwerte) aufgebaut
- Wird automatisch als **RuntimeModelSnapshot** erfasst, wenn eine vollständige Konfiguration erkannt wird
- Ermöglicht Wiederverwendung ohne erneute Eingabe von Zugangsdaten

### Lebenszyklus des RuntimeModelSnapshot

Wenn Sie ein Modell ohne Verwendung von `modelProviders` konfigurieren, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um Ihre Konfiguration zu erhalten:

```bash
# Dies erstellt einen RuntimeModelSnapshot mit der ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Der Snapshot:

- Erfasst Modell-ID, API-Key, Base-URL und Generierungskonfiguration
- Bleibt über Sitzungen hinweg bestehen (wird während der Laufzeit im Speicher gehalten)
- Erscheint in der `/model`-Befehlsliste als Laufzeitoption
- Kann über `/model $runtime|openai|my-custom-model` ausgewählt werden

### Hauptunterschiede

| Aspekt                     | Provider Model                      | Runtime Model                                 |
| -------------------------- | ----------------------------------- | --------------------------------------------- |
| Konfigurationsquelle       | `modelProviders` in Einstellungen   | CLI-, Umgebungs-, Einstellungsebenen          |
| Konfigurationsatomarität   | Vollständiges, undurchlässiges Paket | Geschichtet, jedes Feld unabhängig aufgelöst  |
| Wiederverwendbarkeit       | Immer in `/model`-Liste verfügbar   | Als Snapshot erfasst, erscheint wenn vollständig |
| Team-Sharing               | Ja (über versionierte Einstellungen)| Nein (benutzerlokal)                          |
| Zugangsdaten-Speicherung   | Nur Referenz über `envKey`          | Kann tatsächlichen Key im Snapshot erfassen   |

### Wann welches verwenden

- **Provider Models verwenden**, wenn: Sie Standardmodelle haben, die im Team geteilt werden, konsistente Konfigurationen benötigen oder versehentliche Überschreibungen verhindern möchten
- **Runtime Models verwenden**, wenn: Sie schnell ein neues Modell testen, temporäre Zugangsdaten verwenden oder mit Ad-hoc-Endpunkten arbeiten

## Auswahlpersistenz und Empfehlungen

> [!important]
>
> Definieren Sie `modelProviders` nach Möglichkeit im Benutzerbereich `~/.qwen/settings.json` und vermeiden Sie das Persistieren von Zugangsdaten-Überschreibungen in irgendeinem Bereich. Das Führen des Provider-Katalogs in den Benutzereinstellungen verhindert Merge-/Override-Konflikte zwischen Projekt- und Benutzerbereichen und stellt sicher, dass `/auth`- und `/model`-Aktualisierungen immer in einen konsistenten Bereich zurückgeschrieben werden.

- `/model` und `/auth` persistieren `model.name` (wo zutreffend) und `security.auth.selectedType` im nächsten beschreibbaren Bereich, der bereits `modelProviders` definiert; andernfalls fallen sie auf den Benutzerbereich zurück. Dies hält Arbeitsbereichs-/Benutzerdateien mit dem aktiven Provider-Katalog synchron.
- Ohne `modelProviders` mischt der Resolver CLI-/Umgebungs-/Einstellungsebenen und erstellt Runtime Models. Dies ist für Single-Provider-Setups in Ordnung, aber umständlich bei häufigem Wechsel. Definieren Sie Provider-Kataloge, wenn Multi-Model-Workflows üblich sind, sodass Wechsel atomar, quellenattribuiert und debuggbar bleiben.