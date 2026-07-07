# Model-Provider

Mit Qwen Code kannst du mehrere Model-Provider über die `modelProviders`-Einstellung in deiner `settings.json` konfigurieren. So kannst du mit dem `/model`-Befehl zwischen verschiedenen KI-Modellen und -Providern wechseln.

## Übersicht

Verwende `modelProviders`, um Modelle pro Auth-Typ zu deklarieren, zwischen denen der `/model`-Picker wechseln kann. Die Keys müssen gültige Auth-Typen sein (`openai`, `anthropic`, `gemini` usw.). Jeder Auth-Typ wird auf ein `ProviderConfig`-Objekt mit einem `protocol`-Feld und einem `models`-Feld (das Array der Modelldefinitionen) gemappt. Jeder Eintrag in `models` erfordert eine `id`; `envKey` ist **optional, aber empfohlen** (wenn weggelassen, wird auf den Standard-Env-Key des Auth-Typs zurückgegriffen, z. B. `OPENAI_API_KEY` für `openai`), zusammen mit den optionalen Feldern `name`, `description`, `baseUrl` und `generationConfig`. Credentials werden niemals in den Einstellungen gespeichert; die Runtime liest sie aus `process.env[envKey]`. Qwen OAuth-Modelle bleiben hartcodiert und können nicht überschrieben werden.

> [!note]
>
> Nur der `/model`-Befehl macht nicht standardmäßige Auth-Typen verfügbar. Anthropic, Gemini usw. müssen über `modelProviders` definiert werden. Der `/auth`-Befehl listet drei Top-Level-Optionen auf: **Alibaba ModelStudio** (mit Coding Plan, Token Plan und Standard API Key im Untermenü), **Third-party Providers** und **Custom Provider**. (Qwen OAuth ist kein auswählbarer Dialog-Eintrag mehr; der Free Tier wurde am 15.04.2026 eingestellt.)

> [!note]
>
> **Modell-Eindeutigkeit:** Modelle innerhalb desselben `authType` werden eindeutig durch die Kombination von `id` + `baseUrl` identifiziert. Das bedeutet, du kannst dieselbe Modell-ID (z. B. `"gpt-4o"`) mehrfach unter einem einzigen `authType` definieren, solange jeder Eintrag eine unterschiedliche `baseUrl` hat – zum Beispiel eine, die direkt auf OpenAI zeigt, und eine andere auf einen Proxy-Endpunkt. Wenn zwei Einträge dieselbe `id` und dieselbe `baseUrl` haben (oder beide `baseUrl` weglassen), gewinnt das erste Vorkommen und nachfolgende Duplikate werden mit einer Warnung übersprungen.

## Konfigurationsbeispiele nach Auth-Typ

Im Folgenden findest du umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen, die die verfügbaren Parameter und ihre Kombinationen zeigen.

### Unterstützte Auth-Typen

Die Keys des `modelProviders`-Objekts müssen gültige `authType`-Werte sein. Derzeit unterstützte Auth-Typen sind:

| Auth Type    | Beschreibung                                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI-kompatible APIs (OpenAI, Azure OpenAI, lokale Inference-Server wie vLLM/Ollama)                                                              |
| `anthropic`  | Anthropic Claude API                                                                                                                                |
| `gemini`     | Google Gemini API                                                                                                                                   |
| `qwen-oauth` | Qwen OAuth (hartcodiert, kann in `modelProviders` nicht überschrieben werden)                                                                       |
| `vertex-ai`  | Google Vertex AI (verwendet das `gemini`-Protokoll und das `@google/genai` SDK im Vertex AI Modus; die Auswahl setzt `GOOGLE_GENAI_USE_VERTEXAI=true`)|

> [!warning]
> Wenn ein unbekannter Auth-Typ-Key verwendet wird (z. B. ein Tippfehler wie `"openai-custom"`), wird ein nicht-leerer Key wie er ist als eigene Auth-Typ-Gruppe akzeptiert, aber er wird nicht auf ein bekanntes Protokoll gemappt – seine Modelle funktionieren also nicht wie beabsichtigt und verhalten sich im `/model`-Picker nicht korrekt. Nur leere (leere oder nur aus Leerzeichen bestehende) Keys werden übersprungen. Verwende immer einen der oben aufgeführten unterstützten Auth-Typ-Werte.

### Für API-Requests verwendete SDKs

Qwen Code verwendet die folgenden offiziellen SDKs, um Requests an jeden Provider zu senden:

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - Offizielles OpenAI Node.js SDK               |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Offizielles Anthropic SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Offizielles Google GenAI SDK   |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) mit Custom Provider (DashScope-kompatibel)     |

Das bedeutet, dass die von dir konfigurierte `baseUrl` mit dem erwarteten API-Format des entsprechenden SDK kompatibel sein sollte. Wenn du beispielsweise den Auth-Typ `openai` verwendest, muss der Endpunkt Requests im OpenAI-API-Format akzeptieren.

### OpenAI-kompatible Provider (`openai`)

Dieser Auth-Typ unterstützt nicht nur die offizielle API von OpenAI, sondern auch jeden OpenAI-kompatiblen Endpunkt, einschließlich aggregierter Model-Provider wie OpenRouter und Requesty.

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

### Lokale Self-Hosted Models (über OpenAI-kompatible API)

Die meisten lokalen Inference-Server (vLLM, Ollama, LM Studio usw.) bieten einen OpenAI-kompatiblen API-Endpunkt. Konfiguriere sie mit dem Auth-Typ `openai` und einer lokalen `baseUrl`:

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

Für lokale Server, die keine Authentifizierung erfordern, kannst du einen beliebigen Platzhalterwert für den API-Key verwenden:

```bash
# Für Ollama (keine Auth erforderlich)
export OLLAMA_API_KEY="ollama"

# Für vLLM (wenn keine Auth konfiguriert ist)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Der `extra_body`-Parameter wird **nur für OpenAI-kompatible Provider** (`openai`, `qwen-oauth`) unterstützt. Er wird für Anthropic- und Gemini-Provider ignoriert.

> [!note]
>
> **Über `envKey`**: Das `envKey`-Feld gibt den **Namen einer Umgebungsvariable** an, nicht den tatsächlichen API-Key-Wert. Damit die Konfiguration funktioniert, musst du sicherstellen, dass die entsprechende Umgebungsvariable mit deinem echten API-Key gesetzt ist. Es gibt zwei Möglichkeiten, dies zu tun:
>
> - **Option 1: Verwendung einer `.env`-Datei** (aus Sicherheitsgründen empfohlen):
>   ```bash
>   # ~/.qwen/.env (oder Projekt-Root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Füge `.env` unbedingt zu deiner `.gitignore` hinzu, um zu verhindern, dass Secrets versehentlich committet werden.
> - **Option 2: Verwendung des `env`-Feldes in `settings.json`** (wie in den obigen Beispielen gezeigt):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Jedes Provider-Beispiel enthält ein `env`-Feld, um zu veranschaulichen, wie der API-Key konfiguriert werden sollte.
## Alibaba Cloud Coding Plan

Der Alibaba Cloud Coding Plan bietet eine vorkonfigurierte Auswahl an Qwen-Modellen, die für Coding-Aufgaben optimiert sind. Dieses Feature ist für Nutzer mit API-Zugang zum Alibaba Cloud Coding Plan verfügbar und bietet eine vereinfachte Einrichtung mit automatischen Updates für die Modellkonfiguration.

### Überblick

Wenn du dich mit einem API-Key für den Alibaba Cloud Coding Plan über den Befehl `/auth` authentifizierst, konfiguriert Qwen Code automatisch die folgenden Modelle:

| Model-ID               | Name                 | Beschreibung                                              |
| ---------------------- | -------------------- | --------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Erweitertes Modell mit aktiviertem Thinking               |
| `qwen3.6-plus`         | qwen3.6-plus         | Neuestes Modell mit aktiviertem Thinking (nur Pro-Abonnenten) |
| `qwen3.7-plus`         | qwen3.7-plus         | Erweitertes Modell mit aktiviertem Thinking               |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Optimiert für Coding-Aufgaben                             |
| `qwen3-coder-next`     | qwen3-coder-next     | Experimentelles Coding-Modell                             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Neuestes Max-Modell mit aktiviertem Thinking              |
| `glm-5`                | glm-5                | GLM-Modell mit aktiviertem Thinking                       |
| `glm-4.7`              | glm-4.7              | GLM-Modell mit aktiviertem Thinking                       |
| `kimi-k2.5`            | kimi-k2.5            | Kimi-Modell mit Thinking- sowie Vision-/Video-Support     |
| `MiniMax-M2.5`         | MiniMax-M2.5         | MiniMax-Modell mit aktiviertem Thinking                   |

### Einrichtung

1. Besorge dir einen API-Key für den Alibaba Cloud Coding Plan:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Führe den Befehl `/auth` in Qwen Code aus
3. Wähle **Alibaba ModelStudio** und dann **Coding Plan** aus dem Untermenü
4. Wähle deine Region aus
5. Gib deinen API-Key ein, wenn du dazu aufgefordert wirst

Die Modelle werden automatisch konfiguriert und zu deiner `/model`-Auswahl hinzugefügt.

### Regionen

Der Alibaba Cloud Coding Plan unterstützt zwei Regionen:

| Region               | Endpoint                                        | Beschreibung            |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpoint für Festlandchina |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Internationaler Endpoint |

Die Region wird während der Authentifizierung ausgewählt und in der `modelProviders`-Konfiguration in der `settings.json` gespeichert. Um die Region zu wechseln, führe den Befehl `/auth` erneut aus und wähle eine andere Region.

### API-Key-Speicherung

Wenn du den Coding Plan über den Befehl `/auth` konfigurierst, wird der API-Key unter Verwendung des reservierten Umgebungsvariablennamens `BAILIAN_CODING_PLAN_API_KEY` gespeichert. Standardmäßig wird er im `env`-Feld deiner `settings.json`-Datei gespeichert.

> [!warning]
>
> **Sicherheitsempfehlung**: Für eine bessere Sicherheit wird empfohlen, den API-Key aus der `settings.json` in eine separate `.env`-Datei zu verschieben und ihn als Umgebungsvariable zu laden. Beispiel:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=dein-api-key-hier
> ```
>
> Stelle anschließend sicher, dass diese Datei zu deiner `.gitignore` hinzugefügt wird, wenn du Einstellungen auf Projektebene verwendest.

### Automatische Updates

Die Modellkonfigurationen des Coding Plans sind versioniert. Wenn Qwen Code eine neuere Version der Modellvorlage erkennt, wirst du zu einem Update aufgefordert. Wenn du das Update akzeptierst, wird Folgendes durchgeführt:

- Die bestehenden Coding-Plan-Modellkonfigurationen werden durch die neuesten Versionen ersetzt
- Alle benutzerdefinierten Modellkonfigurationen, die du manuell hinzugefügt hast, bleiben erhalten
- Es wird automatisch zum ersten Modell in der aktualisierten Konfiguration gewechselt

Der Update-Prozess stellt sicher, dass du immer Zugriff auf die neuesten Modellkonfigurationen und Features hast, ohne dass ein manueller Eingriff erforderlich ist.

### Manuelle Konfiguration (Fortgeschritten)

Wenn du Coding-Plan-Modelle lieber manuell konfigurieren möchtest, kannst du sie wie jeden OpenAI-kompatiblen Provider zu deiner `settings.json` hinzufügen:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
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
}
```

> [!note]
>
> Bei der manuellen Konfiguration:
>
> - Du kannst einen beliebigen Umgebungsvariablennamen für `envKey` verwenden
> - Du musst `codingPlan.*` nicht konfigurieren
> - **Automatische Updates gelten nicht** für manuell konfigurierte Coding-Plan-Modelle

> [!warning]
>
> Wenn du auch die automatische Coding-Plan-Konfiguration verwendest, können automatische Updates deine manuellen Konfigurationen überschreiben, wenn sie denselben `envKey` und dieselbe `baseUrl` wie die automatische Konfiguration verwenden. Um dies zu vermeiden, stelle sicher, dass deine manuelle Konfiguration nach Möglichkeit einen anderen `envKey` verwendet.

## Auflösungsebenen und Atomarität

Die effektiven Auth-/Modell-/Credential-Werte werden feldweise anhand der folgenden Priorität ausgewählt (der zuerst vorhandene Wert gewinnt). Du kannst `--auth-type` mit `--model` kombinieren, um direkt auf einen Provider-Eintrag zu verweisen; diese CLI-Flags werden vor anderen Ebenen ausgeführt.

| Ebene (höchste → niedrigste) | authType                            | Modell                                          | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Programmatische Overrides  | `/auth`                             | `/auth`-Eingabe                                 | `/auth`-Eingabe                                       | `/auth`-Eingabe                                        | —                      | —                                 |
| Modellauswahl              | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| CLI-Argumente              | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                    | `--openai-base-url`                                    | —                      | —                                 |
| Umgebungsvariablen         | —                                   | Provider-spezifisches Mapping (z. B. `OPENAI_MODEL`) | Provider-spezifisches Mapping (z. B. `OPENAI_API_KEY`) | Provider-spezifisches Mapping (z. B. `OPENAI_BASE_URL`) | —                      | —                                 |
| Einstellungen (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| Standard / berechnet       | Fällt auf `AuthType.QWEN_OAUTH` zurück | Eingebauter Standard (OpenAI ⇒ `qwen3.5-plus`) | —                                                     | —                                                      | —                      | `Config.getProxy()`, falls konfiguriert |

\*Wenn vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmen `security.auth.selectedType` oder der implizite Standard den Auth-Typ. Qwen OAuth und OpenAI sind die einzigen Auth-Typen, die ohne zusätzliche Konfiguration verfügbar sind.

> [!note]
>
> `--openai-api-key` und `--openai-base-url` sind die einzigen Credential-CLI-Flags. Sie gelten für den aktiven OpenAI-kompatiblen Provider, unabhängig von dessen Namen – es gibt keine `--anthropic-*`- / `--gemini-*`-Credential-Flags. Provider-spezifische Credentials, die nicht über die CLI übergeben werden, werden aus Umgebungsvariablen aufgelöst (siehe die Zeile unten).

> [!warning]
>
> **Deprecation von `security.auth.apiKey` und `security.auth.baseUrl`:** Die direkte Konfiguration von API-Credentials über `security.auth.apiKey` und `security.auth.baseUrl` in der `settings.json` ist veraltet. Diese Einstellungen wurden in früheren Versionen für über die UI eingegebene Credentials verwendet, aber der Credential-Eingabefluss wurde in Version 0.10.1 entfernt. Diese Felder werden in einem zukünftigen Release vollständig entfernt. **Es wird dringend empfohlen, für alle Modell- und Credential-Konfigurationen auf `modelProviders` zu migrieren.** Verwende `envKey` in `modelProviders`, um auf Umgebungsvariablen für ein sicheres Credential-Management zu verweisen, anstatt Credentials hart in Einstellungsdateien zu codieren.

## Generation-Config-Layering: Die undurchdringliche Provider-Ebene

Die Konfigurationsauflösung folgt einem strikten Layering-Modell mit einer entscheidenden Regel: **Die modelProvider-Ebene ist undurchdringlich**.

### Funktionsweise

1. **Wenn ein modelProvider-Modell ausgewählt IST** (z. B. über den Befehl `/model`, bei dem ein provider-konfiguriertes Modell gewählt wird):
   - Die gesamte `generationConfig` des Providers wird **atomar** angewendet
   - **Die Provider-Ebene ist vollständig undurchdringlich** – tiefere Ebenen (CLI, env, settings) nehmen überhaupt nicht an der Auflösung der generationConfig teil
   - Alle in `modelProviders[].generationConfig` definierten Felder verwenden die Werte des Providers
   - Alle vom Provider **nicht definierten** Felder werden auf `undefined` gesetzt (nicht von den Einstellungen geerbt)
   - Dies stellt sicher, dass Provider-Konfigurationen als vollständiges, in sich geschlossenes "versiegeltes Paket" fungieren

   Wenn ein Modell in `modelProviders` aufgeführt ist, platziere alle modellspezifischen
   Generation-Einstellungen für dieses Modell im passenden Provider-Eintrag. Top-Level-
   `model.generationConfig`-Werte, einschließlich `contextWindowSize`,
   `modalities`, `customHeaders` und `extra_body`, werden für Provider-
   Modelle ignoriert. Konfiguriere diese Felder unter
   `modelProviders[authType][].generationConfig`, damit sie angewendet werden.

2. **Wenn KEIN modelProvider-Modell ausgewählt ist** (z. B. bei Verwendung von `--model` mit einer rohen Modell-ID oder bei direkter Verwendung von CLI/env/settings):
   - Die Auflösung fällt auf tiefere Ebenen zurück
   - Felder werden aus CLI → env → settings → Defaults befüllt
   - Dies erzeugt ein **Runtime Model** (siehe nächster Abschnitt)

### Priorität pro Feld für die generationConfig

| Priorität | Quelle                                        | Verhalten                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Programmatische Overrides                     | Runtime-Änderungen durch `/model`, `/auth`                                                               |
| 2        | `modelProviders[authType][].generationConfig` | **Undurchdringliche Ebene** – ersetzt alle generationConfig-Felder vollständig; tiefere Ebenen nehmen nicht teil |
| 3        | `settings.model.generationConfig`             | Wird nur für **Runtime Models** verwendet (wenn kein Provider-Modell ausgewählt ist)                     |
| 4        | Content-Generator-Defaults                    | Provider-spezifische Defaults (z. B. OpenAI vs. Gemini) – nur für Runtime Models                         |

### Atomare Feldbehandlung

Die folgenden Felder werden als atomare Objekte behandelt – Provider-Werte ersetzen das gesamte Objekt vollständig, es findet kein Merging statt:

- `samplingParams` – Temperature, top_p, max_tokens usw.
- `customHeaders` – Benutzerdefinierte HTTP-Header
- `extra_body` – Zusätzliche Request-Body-Parameter

### Beispiel
```jsonc
// Benutzer-Einstellungen (~/.qwen/settings.json)
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

Wenn `gpt-4o` aus `modelProviders` ausgewählt wird:

- `timeout` = 60000 (vom Provider, überschreibt die Einstellungen)
- `samplingParams.temperature` = 0.2 (vom Provider, ersetzt das Einstellungsobjekt vollständig)
- `samplingParams.max_tokens` = **undefined** (nicht im Provider definiert, und die Provider-Ebene erbt nicht von den Einstellungen – Felder werden explizit auf undefined gesetzt, wenn sie nicht angegeben werden)

Bei Verwendung eines Raw-Modells über `--model gpt-4` (nicht aus `modelProviders`, erstellt ein Runtime Model):

- `timeout` = 30000 (aus den Einstellungen)
- `samplingParams.temperature` = 0.5 (aus den Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus den Einstellungen)

Die Merge-Strategie für `modelProviders` selbst ist REPLACE: Das gesamte `modelProviders` aus den Projekt-Einstellungen überschreibt den entsprechenden Abschnitt in den Benutzer-Einstellungen, anstatt die beiden zusammenzuführen.

## Reasoning / Thinking-Konfiguration

Das optionale `reasoning`-Feld unter `generationConfig` steuert, wie intensiv das Modell vor der Antwort reasoniert. Die Anthropic- und Gemini-Konverter berücksichtigen dies immer. Die OpenAI-kompatible Pipeline berücksichtigt dies **nur, wenn** `generationConfig.samplingParams` nicht gesetzt ist — siehe den Hinweis "Interaktion mit `samplingParams`" weiter unten.

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
            //   'low'    | 'medium' — serverseitig auf 'high' bei DeepSeek gemappt
            //   'high'   — Standard-Reasoning-Intensität
            //   'max'    — DeepSeek-spezifische extra-starke Stufe
            // Oder `false` setzen, um Reasoning vollständig zu deaktivieren.
            "reasoning": { "effort": "max" },
          },
        },
      ],
    },
  },
}
```

### Verhalten pro Provider

| Protokoll / Provider                           | Wire-Format                                                          | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)     | Flat `reasoning_effort: <effort>` Body-Parameter                     | Wenn `reasoning.effort` in der verschachtelten Konfigurationsstruktur gesetzt ist, wird es in das flache `reasoning_effort` umgeschrieben und `'low'`/`'medium'` werden auf `'high'`, `'xhigh'` auf `'max'` normalisiert – entsprechend DeepSeeks [serverseitiger Abwärtskompatibilität](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion). Überschreibungen auf oberster Ebene wie `samplingParams.reasoning_effort` oder `extra_body.reasoning_effort` überspringen diese Normalisierung und werden unverändert übertragen. |
| **OpenAI** (andere kompatible Server)          | `reasoning: { effort, ... }` wird unverändert durchgereicht          | Wird über `samplingParams` gesetzt (z. B. `samplingParams.reasoning_effort` für GPT-5/o-Serie), wenn der Provider eine andere Struktur erwartet.                                                                                                                                                                                                                                                                                     |
| **Anthropic** (echtes `api.anthropic.com`)     | `output_config: { effort }` plus dem `effort-2025-11-24` Beta-Header | Das echte Anthropic akzeptiert nur `'low'`/`'medium'`/`'high'`. `'max'` wird **auf `'high'` begrenzt** mit einer `debugLogger.warn`-Zeile (einmal pro Generator); wenn du maximale Effort willst, wechsle die baseURL zu einem DeepSeek-kompatiblen Endpoint, der dies unterstützt.                                                                                                                                                 |
| **Anthropic** (`api.deepseek.com/anthropic`)   | Gleiches `output_config: { effort }` + Beta-Header                   | `'max'` wird unverändert durchgereicht.                                                                                                                                                                                                                                                                                                                                                                                              |
| **Gemini** (`@google/genai`)                   | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, andere → `THINKING_LEVEL_UNSPECIFIED` (Gemini hat keine `MAX`-Stufe).                                                                                                                                                                                                                                                                                                                   |

### `reasoning: false`

Das Setzen von `reasoning: false` (der boolesche Literalwert) deaktiviert Thinking bei jedem Provider explizit – nützlich für günstige Nebenabfragen, die nicht von Reasoning profitieren. Dies wird auch auf Request-Ebene über `request.config.thinkingConfig.includeThoughts: false` für einmalige Aufrufe (z. B. Vorschlagsgenerierung) berücksichtigt.

Bei einer `api.deepseek.com`-baseURL gibt die OpenAI-Pipeline das explizite Feld `thinking: { type: 'disabled' }` aus, das DeepSeek V4+ erfordert – der serverseitige Standard ist `'enabled'`, daher würde das einfache Weglassen von `reasoning_effort` immer noch Thinking-Latenz/-Kosten verursachen. Self-hosted DeepSeek-Backends (sglang/vllm) und andere OpenAI-kompatible Server erhalten dieses Feld **nicht**; wenn du Thinking dort deaktivieren musst, injiziere `thinking: { type: 'disabled' }` (oder welchen Regler dein Inference-Framework auch immer bereitstellt) über `samplingParams`/`extra_body`.

### Interaktion mit `samplingParams` (nur OpenAI-kompatibel)

> [!warning]
>
> Wenn `generationConfig.samplingParams` bei einem OpenAI-kompatiblen Provider gesetzt ist, überträgt die Pipeline diese Schlüssel **unverändert** und überspringt die separate `reasoning`-Injektion vollständig. Eine Konfiguration wie `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` wird das Reasoning-Feld bei OpenAI/DeepSeek-Requests also stillschweigend verwerfen.
>
> Wenn du `samplingParams` setzt, füge den Reasoning-Regler direkt dort ein – für DeepSeek ist das `samplingParams.reasoning_effort`, für die GPT-5/o-Serie ist es `samplingParams.reasoning_effort` (deren flaches Feld) oder `samplingParams.reasoning` (das verschachtelte Objekt). Bei OpenRouter und anderen Providern variiert der Feldname; konsultiere die Provider-Dokumentation.
>
> Die Anthropic- und Gemini-Konverter sind davon nicht betroffen – sie lesen `reasoning.effort` immer direkt, unabhängig von `samplingParams`.

### `budget_tokens`

Du kannst ein exaktes Thinking-Token-Budget festlegen, indem du `budget_tokens` zusammen mit `effort` angibst:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Für Anthropic wird dies zu `thinking.budget_tokens`. Für OpenAI/DeepSeek bleibt das Feld erhalten, wird aber derzeit vom Server ignoriert – `reasoning_effort` ist der entscheidende Regler.

## Provider Models vs. Runtime Models

Qwen Code unterscheidet zwischen zwei Arten von Modellkonfigurationen:

### Provider Model

- Definiert in der `modelProviders`-Konfiguration
- Verfügt über ein vollständiges, atomares Konfigurationspaket
- Bei Auswahl wird seine Konfiguration als undurchdringliche Ebene angewendet
- Erscheint in der `/model`-Befehlsliste mit vollständigen Metadaten (Name, Beschreibung, Fähigkeiten)
- Empfohlen für Multi-Model-Workflows und Team-Konsistenz

### Runtime Model

- Wird dynamisch erstellt, wenn Raw-Modell-IDs über CLI (`--model`), Umgebungsvariablen oder Einstellungen verwendet werden
- Nicht in `modelProviders` definiert
- Die Konfiguration wird durch "Projektion" durch die Auflösungs-Ebenen aufgebaut (CLI → env → settings → defaults)
- Wird automatisch als **RuntimeModelSnapshot** erfasst, wenn eine vollständige Konfiguration erkannt wird
- Ermöglicht Wiederverwendung ohne erneute Eingabe der Credentials

### RuntimeModelSnapshot-Lebenszyklus

Wenn du ein Modell ohne Verwendung von `modelProviders` konfigurierst, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um deine Konfiguration zu speichern:

```bash
# Dies erstellt einen RuntimeModelSnapshot mit der ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Der Snapshot:

- Erfasst Modell-ID, API-Key, Base-URL und Generation-Config
- Bleibt über Sessions hinweg erhalten (während der Laufzeit im Speicher gespeichert)
- Erscheint in der `/model`-Befehlsliste als Runtime-Option
- Kann über `/model $runtime|openai|my-custom-model` umgeschaltet werden

### Wichtige Unterschiede

| Aspekt                    | Provider Model                    | Runtime Model                              |
| ------------------------- | --------------------------------- | ------------------------------------------ |
| Konfigurationsquelle      | `modelProviders` in den Einstellungen | CLI-, env-, settings-Ebenen              |
| Konfigurationsatomarität  | Vollständiges, undurchdringliches Paket | Geschichtet, jedes Feld wird unabhängig aufgelöst |
| Wiederverwendbarkeit      | Immer in der `/model`-Liste verfügbar | Als Snapshot erfasst, erscheint wenn vollständig |
| Team-Sharing              | Ja (über committete Einstellungen) | Nein (benutzerlokal)                     |
| Credential-Speicherung    | Nur Referenzierung über `envKey`  | Kann den tatsächlichen Key im Snapshot erfassen |

### Wann was zu verwenden ist

- **Provider Models verwenden**, wenn: Du Standardmodelle hast, die im ganzen Team geteilt werden, konsistente Konfigurationen benötigst oder unbeabsichtigte Überschreibungen verhindern willst
- **Runtime Models verwenden**, wenn: Du schnell ein neues Modell testest, temporäre Credentials verwendest oder mit Ad-hoc-Endpoints arbeitest

## Persistenz der Auswahl und Empfehlungen

> [!important]
>
> Definiere `modelProviders` wann immer möglich im User-Scope `~/.qwen/settings.json` und vermeide es, Credential-Überschreibungen in einem beliebigen Scope zu persistieren. Das Beibehalten des Provider-Katalogs in den Benutzer-Einstellungen verhindert Merge-/Override-Konflikte zwischen Projekt- und Benutzer-Scopes und stellt sicher, dass `/auth`- und `/model`-Updates immer in einen konsistenten Scope zurückschreiben.

- `/model` und `/auth` persistieren `model.name` (wo zutreffend) und `security.auth.selectedType` in den nächstgelegenen beschreibbaren Scope, der bereits `modelProviders` definiert; andernfalls fallen sie auf den Benutzer-Scope zurück. Dies hält Workspace-/Benutzer-Dateien synchron mit dem aktiven Provider-Katalog.
- Ohne `modelProviders` mischt der Resolver CLI-/env-/settings-Ebenen und erstellt Runtime Models. Das ist für Single-Provider-Setups in Ordnung, aber umständlich bei häufigem Wechseln. Definiere Provider-Kataloge, wann immer Multi-Model-Workflows üblich sind, damit Wechsel atomar, quellzuordenbar und debugbar bleiben.