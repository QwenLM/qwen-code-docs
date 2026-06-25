# Modellanbieter

Qwen Code ermöglicht es Ihnen, mehrere Modellanbieter über die Einstellung `modelProviders` in Ihrer `settings.json` zu konfigurieren. Dadurch können Sie mit dem Befehl `/model` zwischen verschiedenen KI-Modellen und Anbietern wechseln.

## Übersicht

Verwenden Sie `modelProviders`, um Modelle pro Authentifizierungstyp zu deklarieren, zwischen denen die `/model`-Auswahl umschalten kann. Schlüssel müssen gültige Authentifizierungstypen sein (`openai`, `anthropic`, `gemini`, usw.). Jeder Authentifizierungstyp wird auf ein `ProviderConfig`-Objekt mit einem `protocol`-Feld und einem `models`-Feld (dem Array von Modelldefinitionen) abgebildet. Jeder Eintrag in `models` benötigt eine `id`; `envKey` ist **optional und empfohlen** (wenn weggelassen, wird auf den Standard-Umgebungsschlüssel des Authentifizierungstyps zurückgegriffen, z. B. `OPENAI_API_KEY` für `openai`), mit optionalen Feldern `name`, `description`, `baseUrl` und `generationConfig`. Anmeldedaten werden niemals in den Einstellungen gespeichert; die Laufzeitumgebung liest sie aus `process.env[envKey]`. Qwen-OAuth-Modelle bleiben fest codiert und können nicht überschrieben werden.

> [!note]
>
> Nur der Befehl `/model` macht nicht-standardmäßige Authentifizierungstypen verfügbar. Anthropic, Gemini usw. müssen über `modelProviders` definiert werden. Der Befehl `/auth` listet drei übergeordnete Optionen auf: **Alibaba ModelStudio** (mit Coding Plan, Token Plan und Standard API Key in dessen Untermenü), **Drittanbieter** und **Eigener Anbieter**. (Qwen-OAuth ist kein auswählbarer Dialogeintrag mehr; dessen kostenloses Kontingent wurde am 15.04.2026 eingestellt.)

> [!note]
>
> **Eindeutigkeit von Modellen:** Modelle innerhalb desselben `authType` werden eindeutig durch die Kombination von `id` + `baseUrl` identifiziert. Das bedeutet, Sie können dieselbe Modell-ID (z. B. `"gpt-4o"`) mehrmals unter einem einzigen `authType` definieren, solange jeder Eintrag eine andere `baseUrl` hat – zum Beispiel einer, der direkt auf OpenAI zeigt, und ein anderer auf einen Proxy-Endpunkt. Wenn zwei Einträge sowohl die gleiche `id` als auch die gleiche `baseUrl` teilen (oder beide `baseUrl` weglassen), gewinnt der erste Vorkommnis und nachfolgende Duplikate werden mit einer Warnung übersprungen.

## Konfigurationsbeispiele nach Authentifizierungstyp

Im Folgenden finden Sie umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen, die die verfügbaren Parameter und deren Kombinationen zeigen.

### Unterstützte Authentifizierungstypen

Die Schlüssel des Objekts `modelProviders` müssen gültige `authType`-Werte sein. Derzeit unterstützte Authentifizierungstypen sind:

| Auth-Typ     | Beschreibung                                                                                                                                                           |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`     | OpenAI-kompatible APIs (OpenAI, Azure OpenAI, lokale Inferenzserver wie vLLM/Ollama)                                                                                   |
| `anthropic`  | Anthropic Claude API                                                                                                                                                   |
| `gemini`     | Google Gemini API                                                                                                                                                      |
| `qwen-oauth` | Qwen-OAuth (fest codiert, kann nicht in `modelProviders` überschrieben werden)                                                                                         |
| `vertex-ai`  | Google Vertex AI (verwendet das `gemini`-Protokoll und das `@google/genai`-SDK im Vertex-AI-Modus; die Auswahl setzt `GOOGLE_GENAI_USE_VERTEXAI=true`)                 |

> [!warning]
> Wenn ein unbekannter Authentifizierungstyp-Schlüssel verwendet wird (z. B. ein Tippfehler wie `"openai-custom"`), wird ein nicht-leerer Schlüssel als eigene Authentifizierungstyp-Gruppe akzeptiert, aber er wird keinem bekannten Protokoll zugeordnet – daher funktionieren seine Modelle nicht wie beabsichtigt und verhalten sich in der `/model`-Auswahl nicht korrekt. Nur leere (nur Leerzeichen oder leer) Schlüssel werden übersprungen. Verwenden Sie immer einen der oben aufgeführten unterstützten Authentifizierungstyp-Werte.

### Verwendete SDKs für API-Anfragen

Qwen Code verwendet die folgenden offiziellen SDKs, um Anfragen an die einzelnen Anbieter zu senden:

| Auth-Typ     | SDK-Paket                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) – Offizielles OpenAI Node.js SDK                       |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) – Offizielles Anthropic SDK      |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) – Offizielles Google GenAI SDK          |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) mit benutzerdefiniertem Anbieter (DashScope-kompatibel) |

Dies bedeutet, dass die von Ihnen konfigurierte `baseUrl` mit dem erwarteten API-Format des entsprechenden SDKs kompatibel sein sollte. Wenn Sie beispielsweise den Authentifizierungstyp `openai` verwenden, muss der Endpunkt Anfragen im OpenAI-API-Format akzeptieren.

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

### Lokale selbstgehostete Modelle (über OpenAI-kompatible API)

Die meisten lokalen Inferenzserver (vLLM, Ollama, LM Studio usw.) bieten einen OpenAI-kompatiblen API-Endpunkt an. Konfigurieren Sie sie mit dem `openai`-Auth-Typ und einer lokalen `baseUrl`:

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
Für lokale Server, die keine Authentifizierung erfordern, können Sie einen beliebigen Platzhalterwert für den API-Schlüssel verwenden:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Der Parameter `extra_body` wird **nur für OpenAI-kompatible Anbieter** (`openai`, `qwen-oauth`) unterstützt. Für Anthropic- und Gemini-Anbieter wird er ignoriert.

> [!note]
>
> **Hinweis zu `envKey`**: Das Feld `envKey` gibt den **Namen einer Umgebungsvariable** an, nicht den tatsächlichen API-Schlüsselwert. Damit die Konfiguration funktioniert, müssen Sie sicherstellen, dass die entsprechende Umgebungsvariable mit Ihrem tatsächlichen API-Schlüssel gesetzt ist. Es gibt zwei Möglichkeiten, dies zu tun:
>
> - **Option 1: Mit einer `.env`-Datei** (aus Sicherheitsgründen empfohlen):
>   ```bash
>   # ~/.qwen/.env (or project root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Fügen Sie `.env` unbedingt zu Ihrer `.gitignore` hinzu, um zu verhindern, dass versehentlich Geheimnisse committet werden.
> - **Option 2: Mit dem Feld `env` in `settings.json`** (wie in den obigen Beispielen gezeigt):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Jedes Anbieterbeispiel enthält ein Feld `env`, um zu veranschaulichen, wie der API-Schlüssel konfiguriert werden sollte.

## Alibaba Cloud Coding Plan

Alibaba Cloud Coding Plan bietet einen vorkonfigurierten Satz von Qwen-Modellen, die für Codierungsaufgaben optimiert sind. Diese Funktion steht Benutzern mit API-Zugriff auf den Alibaba Cloud Coding Plan zur Verfügung und bietet eine vereinfachte Einrichtung mit automatischen Modellkonfigurationsaktualisierungen.

### Überblick

Wenn Sie sich mit einem Alibaba Cloud Coding Plan-API-Schlüssel über den Befehl `/auth` authentifizieren, konfiguriert Qwen Code automatisch die folgenden Modelle:

| Modell-ID              | Name                  | Beschreibung                                                |
| ---------------------- | --------------------- | ----------------------------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus          | Fortschrittliches Modell mit aktiviertem Denkmodus          |
| `qwen3.6-plus`         | qwen3.6-plus          | Neuestes Modell mit aktiviertem Denkmodus (nur Pro-Abonnenten) |
| `qwen3.7-plus`         | qwen3.7-plus          | Fortschrittliches Modell mit aktiviertem Denkmodus          |
| `qwen3-coder-plus`     | qwen3-coder-plus      | Optimiert für Codierungsaufgaben                            |
| `qwen3-coder-next`     | qwen3-coder-next      | Experimentelles Codierungsmodell                            |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23  | Neuestes Max-Modell mit aktiviertem Denkmodus               |
| `glm-5`                | glm-5                 | GLM-Modell mit aktiviertem Denkmodus                        |
| `glm-4.7`              | glm-4.7               | GLM-Modell mit aktiviertem Denkmodus                        |
| `kimi-k2.5`            | kimi-k2.5             | Kimi-Modell mit Denkmodus und Vision/Videounterstützung     |
| `MiniMax-M2.5`         | MiniMax-M2.5          | MiniMax-Modell mit aktiviertem Denkmodus                    |

### Einrichtung

1. Besorgen Sie sich einen Alibaba Cloud Coding Plan-API-Schlüssel:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Führen Sie den Befehl `/auth` in Qwen Code aus
3. Wählen Sie **Alibaba ModelStudio** und dann im Untermenü **Coding Plan**
4. Wählen Sie Ihre Region
5. Geben Sie Ihren API-Schlüssel ein, wenn Sie dazu aufgefordert werden

Die Modelle werden automatisch konfiguriert und zu Ihrer `/model`-Auswahl hinzugefügt.

### Regionen

Alibaba Cloud Coding Plan unterstützt zwei Regionen:

| Region               | Endpoint                                        | Beschreibung                 |
| -------------------- | ----------------------------------------------- | ---------------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpunkt für das chinesische Festland |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Internationaler Endpunkt     |

Die Region wird während der Authentifizierung ausgewählt und in `settings.json` unter der `modelProviders`-Konfiguration gespeichert. Um die Region zu wechseln, führen Sie den Befehl `/auth` erneut aus und wählen Sie eine andere Region.

### Speicherung des API-Schlüssels

Wenn Sie Coding Plan über den Befehl `/auth` konfigurieren, wird der API-Schlüssel unter dem reservierten Umgebungsvariablennamen `BAILIAN_CODING_PLAN_API_KEY` gespeichert. Standardmäßig wird er im Feld `env` Ihrer `settings.json`-Datei gespeichert.

> [!warning]
>
> **Sicherheitsempfehlung**: Aus Gründen der besseren Sicherheit wird empfohlen, den API-Schlüssel aus `settings.json` in eine separate `.env`-Datei zu verschieben und als Umgebungsvariable zu laden. Zum Beispiel:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Stellen Sie dann sicher, dass diese Datei zu Ihrer `.gitignore` hinzugefügt wird, wenn Sie projektspezifische Einstellungen verwenden.

### Automatische Aktualisierungen

Die Konfigurationen der Coding Plan-Modelle sind versioniert. Wenn Qwen Code eine neuere Version der Modellvorlage erkennt, werden Sie zur Aktualisierung aufgefordert. Wenn Sie die Aktualisierung akzeptieren, werden:
- Ersetze die vorhandenen Coding-Plan-Modellkonfigurationen durch die neuesten Versionen
- Bewahre alle benutzerdefinierten Modellkonfigurationen, die du manuell hinzugefügt hast
- Wechsle automatisch zum ersten Modell in der aktualisierten Konfiguration

Der Aktualisierungsprozess stellt sicher, dass du immer Zugriff auf die neuesten Modellkonfigurationen und Funktionen hast, ohne manuelle Eingriffe.

### Manuelle Konfiguration (Erweitert)

Wenn du Coding-Plan-Modelle manuell konfigurieren möchtest, kannst du sie wie jeden OpenAI-kompatiblen Anbieter in deine `settings.json` aufnehmen:

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
> - Du kannst jeden beliebigen Umgebungsvariablennamen für `envKey` verwenden
> - Du musst `codingPlan.*` nicht konfigurieren
> - **Automatische Aktualisierungen werden nicht auf** manuell konfigurierte Coding-Plan-Modelle angewendet

> [!warning]
>
> Wenn du auch die automatische Coding-Plan-Konfiguration verwendest, können automatische Aktualisierungen deine manuellen Konfigurationen überschreiben, wenn sie den gleichen `envKey` und die gleiche `baseUrl` wie die automatische Konfiguration verwenden. Um dies zu vermeiden, stelle sicher, dass deine manuelle Konfiguration, wenn möglich, einen anderen `envKey` verwendet.

## Auflösungsebenen und Atomizität

Die effektiven Auth-/Modell-/Credential-Werte werden pro Feld gemäß der folgenden Priorität ausgewählt (erster Treffer gewinnt). Du kannst `--auth-type` mit `--model` kombinieren, um direkt auf einen Anbietereintrag zu verweisen; diese CLI-Flags werden vor anderen Ebenen ausgeführt.

| Ebene (höchste → niedrigste)   | authType                            | model                                           | apiKey                                                | baseUrl                                                | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ | ---------------------- | --------------------------------- |
| Programmatische Überschreibungen     | `/auth`                             | `/auth` input                                   | `/auth` input                                         | `/auth` input                                          | —                      | —                                 |
| Modellanbieterauswahl     | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                           | `modelProvider.baseUrl`                                | `modelProvider.envKey` | —                                 |
| CLI-Argumente              | `--auth-type`                       | `--model`                                       | `--openai-api-key` (oder anbieterspezifische Entsprechungen) | `--openai-base-url` (oder anbieterspezifische Entsprechungen) | —                      | —                                 |
| Umgebungsvariablen      | —                                   | Anbieterspezifische Zuordnung (z.B. `OPENAI_MODEL`) | Anbieterspezifische Zuordnung (z.B. `OPENAI_API_KEY`)     | Anbieterspezifische Zuordnung (z.B. `OPENAI_BASE_URL`)     | —                      | —                                 |
| Einstellungen (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                                | `security.auth.baseUrl`                                | —                      | —                                 |
| Standard / berechnet         | Fällt zurück auf `AuthType.QWEN_OAUTH` | Eingebauter Standard (OpenAI ⇒ `qwen3.5-plus`)      | —                                                     | —                                                      | —                      | `Config.getProxy()` falls konfiguriert |

\*Wenn vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmt `security.auth.selectedType` oder der implizite Standard den Auth-Typ. Qwen OAuth und OpenAI sind die einzigen Auth-Typen, die ohne zusätzliche Konfiguration angezeigt werden.

> [!warning]
>
> **Veraltung von `security.auth.apiKey` und `security.auth.baseUrl`:** Die direkte Konfiguration von API-Anmeldeinformationen über `security.auth.apiKey` und `security.auth.baseUrl` in `settings.json` ist veraltet. Diese Einstellungen wurden in historischen Versionen für über die Benutzeroberfläche eingegebene Anmeldeinformationen verwendet, aber der Anmeldeinformations-Eingabefluss wurde in Version 0.10.1 entfernt. Diese Felder werden in einem zukünftigen Release vollständig entfernt. **Es wird dringend empfohlen, auf `modelProviders` umzusteigen** für alle Modell- und Anmeldeinformationskonfigurationen. Verwende `envKey` in `modelProviders`, um auf Umgebungsvariablen für die sichere Verwaltung von Anmeldeinformationen zu verweisen, anstatt Anmeldeinformationen in Einstellungsdateien hartzukodieren.

## Generierungskonfigurations-Schichtung: Die undurchlässige Anbieterschicht
Die Konfigurationsauflösung folgt einem strengen Schichtenmodell mit einer entscheidenden Regel: **die modelProvider-Schicht ist undurchlässig**.

### So funktioniert es

1. **Wenn ein modelProvider-Modell ausgewählt wird** (z. B. über den Befehl `/model`, der ein vom Provider konfiguriertes Modell wählt):
   - Die gesamte `generationConfig` des Providers wird **atomar** angewendet
   - **Die Provider-Schicht ist vollständig undurchlässig** — niedrigere Schichten (CLI, Env, Einstellungen) haben keinerlei Einfluss auf die generationConfig-Auflösung
   - Alle in `modelProviders[].generationConfig` definierten Felder verwenden die Werte des Providers
   - Alle **nicht definierten** Felder des Providers werden auf `undefined` gesetzt (nicht von den Einstellungen geerbt)
   - Dadurch wirken Provider-Konfigurationen wie ein vollständiges, in sich geschlossenes "versiegeltes Paket"

   Wenn ein Modell in `modelProviders` aufgeführt ist, fügen Sie alle modellspezifischen Generierungseinstellungen für dieses Modell im entsprechenden Provider-Eintrag ein. Werte der obersten Ebene `model.generationConfig`, einschließlich `contextWindowSize`, `modalities`, `customHeaders` und `extra_body`, werden für Provider-Modelle ignoriert. Konfigurieren Sie diese Felder unter `modelProviders[authType][].generationConfig`, damit sie angewendet werden.

2. **Wenn kein modelProvider-Modell ausgewählt wird** (z. B. bei Verwendung von `--model` mit einer rohen Modell-ID oder bei direkter Nutzung von CLI/Env/Einstellungen):
   - Die Auflösung fällt auf die niedrigeren Schichten zurück
   - Felder werden von CLI → Env → Einstellungen → Standardwerte befüllt
   - Dies erzeugt ein **Laufzeitmodell** (siehe nächster Abschnitt)

### Feldpriorität für `generationConfig`

| Priorität | Quelle                                        | Verhalten                                                                                                |
| --------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1         | Programmatische Überschreibungen              | Laufzeit-Änderungen über `/model`, `/auth`                                                                |
| 2         | `modelProviders[authType][].generationConfig` | **Undurchlässige Schicht** — ersetzt alle generationConfig-Felder vollständig; niedrigere Schichten haben keinen Einfluss |
| 3         | `settings.model.generationConfig`             | Nur für **Laufzeitmodelle** verwendet (wenn kein Provider-Modell ausgewählt ist)                           |
| 4         | Content-Generator-Standardwerte               | Provider-spezifische Standardwerte (z. B. OpenAI vs. Gemini) — nur für Laufzeitmodelle                    |

### Atomare Feldbehandlung

Die folgenden Felder werden als atomare Objekte behandelt — Provider-Werte ersetzen das gesamte Objekt vollständig, es findet keine Zusammenführung statt:

- `samplingParams` — Temperature, top_p, max_tokens, usw.
- `customHeaders` — Benutzerdefinierte HTTP-Header
- `extra_body` — Zusätzliche Request-Body-Parameter

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

- `timeout` = 60000 (vom Provider, überschreibt die Einstellungen)
- `samplingParams.temperature` = 0.2 (vom Provider, ersetzt das Einstellungsobjekt vollständig)
- `samplingParams.max_tokens` = **undefined** (im Provider nicht definiert, und die Provider-Schicht erbt nicht von den Einstellungen — Felder werden explizit auf undefined gesetzt, wenn nicht angegeben)

Bei Verwendung eines rohen Modells über `--model gpt-4` (nicht aus modelProviders, erzeugt ein Laufzeitmodell):

- `timeout` = 30000 (aus den Einstellungen)
- `samplingParams.temperature` = 0.5 (aus den Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus den Einstellungen)

Die Zusammenführungsstrategie für `modelProviders` selbst ist ERSETZEN: Die gesamten `modelProviders` aus den Projekteinstellungen überschreiben den entsprechenden Abschnitt in den Benutzereinstellungen, anstatt die beiden zusammenzuführen.

## Reasoning-/Denk-Konfiguration

Das optionale Feld `reasoning` unter `generationConfig` steuert, wie intensiv das Modell vor einer Antwort nachdenkt. Die Anthropic- und Gemini-Converter beachten es immer. Die OpenAI-kompatible Pipeline beachtet es, **es sei denn**, `generationConfig.samplingParams` ist gesetzt — siehe den Hinweis "Interaktion mit `samplingParams`" unten.

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
            //   'low'    | 'medium' — vom Server auf 'high' bei DeepSeek abgebildet
            //   'high'   — Standard-Reasoning-Intensität
            //   'max'    — DeepSeek-spezifische extra-starke Stufe
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

| Protokoll / Provider                         | Wire-Form                                                              | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | Flacher `reasoning_effort: <effort>` Body-Parameter                    | Wenn `reasoning.effort` in der verschachtelten Konfiguration gesetzt ist, wird es in das flache `reasoning_effort` umgeschrieben und `'low'`/`'medium'` werden zu `'high'`, `'xhigh'` zu `'max'` normalisiert – spiegelbildlich zu DeepSeeks [server-seitiger Abwärtskompatibilität](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion). Top-Level `samplingParams.reasoning_effort` oder `extra_body.reasoning_effort` überschreiben diese Normalisierung und werden unverändert gesendet. |
| **OpenAI** (andere kompatible Server)        | `reasoning: { effort, ... }` wird unverändert durchgereicht            | Wird über `samplingParams` gesetzt (z.B. `samplingParams.reasoning_effort` für GPT-5/o-Serie), wenn der Provider eine andere Form erwartet.                                                                                                                                                                                                                                                                                       |
| **Anthropic** (echte `api.anthropic.com`)    | `output_config: { effort }` plus der `effort-2025-11-24` Beta-Header   | Echter Anthropic akzeptiert nur `'low'`/`'medium'`/`'high'`. `'max'` wird auf `'high'` **begrenzt** mit einem `debugLogger.warn`-Eintrag (einmal pro Generator); wenn Sie maximale Anstrengung wünschen, wechseln Sie die baseURL zu einem DeepSeek-kompatiblen Endpunkt, der dies unterstützt.                                                                                                                                   |
| **Anthropic** (`api.deepseek.com/anthropic`) | Gleicher `output_config: { effort }` + Beta-Header                     | `'max'` wird unverändert durchgereicht.                                                                                                                                                                                                                                                                                                                                                                                           |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`             | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, andere → `THINKING_LEVEL_UNSPECIFIED` (Gemini hat keine `MAX`-Stufe).                                                                                                                                                                                                                                                                                                                |

### `reasoning: false`

Das Setzen von `reasoning: false` (der wörtliche boolesche Wert) deaktiviert explizit das Denken bei jedem Provider – nützlich für kostengünstige Nebenabfragen, die keine Überlegungen erfordern. Dies wird auch auf Anfrageebene über `request.config.thinkingConfig.includeThoughts: false` für einmalige Aufrufe (z.B. Vorschlagsgenerierung) berücksichtigt.

Bei einer `api.deepseek.com`-baseURL sendet die OpenAI-Pipeline das explizite Feld `thinking: { type: 'disabled' }`, das DeepSeek V4+ benötigt – der serverseitige Standard ist `'enabled'`, daher würde das bloße Weglassen von `reasoning_effort` immer noch Denk-Latenz/-Kosten verursachen. Selbst gehostete DeepSeek-Backends (sglang/vllm) und andere OpenAI-kompatible Server erhalten dieses Feld **nicht**; wenn Sie das Denken dort deaktivieren müssen, fügen Sie `thinking: { type: 'disabled' }` (oder den entsprechenden Schalter Ihres Inferenz-Frameworks) über `samplingParams`/`extra_body` ein.

### Interaktion mit `samplingParams` (nur OpenAI-kompatibel)

> [!warning]
>
> Wenn `generationConfig.samplingParams` bei einem OpenAI-kompatiblen Provider gesetzt ist, sendet die Pipeline diese Schlüssel **unverändert** auf die Leitung und überspringt die separate `reasoning`-Injektion vollständig. Eine Konfiguration wie `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` wird das Reasoning-Feld bei OpenAI/DeepSeek-Anfragen also stillschweigend fallen lassen.
>
> Wenn Sie `samplingParams` setzen, nehmen Sie den Reasoning-Knopf direkt darin auf – für DeepSeek ist das `samplingParams.reasoning_effort`, für die GPT-5/o-Serie ist es `samplingParams.reasoning_effort` (der flache Feldname) oder `samplingParams.reasoning` (das verschachtelte Objekt). Bei OpenRouter und anderen Providern variiert der Feldname; konsultieren Sie die Provider-Dokumentation.
>
> Die Anthropic- und Gemini-Konverter sind nicht betroffen – sie lesen `reasoning.effort` immer direkt, unabhängig von `samplingParams`.
### `budget_tokens`

Sie können ein genaues Denk-Token-Budget festlegen, indem Sie `budget_tokens` zusammen mit `effort` angeben:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Bei Anthropic wird daraus `thinking.budget_tokens`. Bei OpenAI/DeepSeek wird das Feld beibehalten, aber derzeit vom Server ignoriert – `reasoning_effort` ist der steuernde Drehknopf.

## Provider-Modelle vs. Runtime-Modelle

Qwen Code unterscheidet zwei Arten von Modellkonfigurationen:

### Provider-Modell

- Definiert in der `modelProviders`-Konfiguration
- Hat ein vollständiges, atomares Konfigurationspaket
- Bei Auswahl wird seine Konfiguration als undurchlässige Schicht angewendet
- Erscheint in der `/model`-Befehlsliste mit vollständigen Metadaten (Name, Beschreibung, Fähigkeiten)
- Empfohlen für Multi-Modell-Workflows und Teamkonsistenz

### Runtime-Modell

- Wird dynamisch erstellt, wenn rohe Modell-IDs über die CLI (`--model`), Umgebungsvariablen oder Einstellungen verwendet werden
- Nicht in `modelProviders` definiert
- Die Konfiguration wird durch 'Projizieren' durch Auflösungsschichten (CLI → Env → Einstellungen → Standardwerte) aufgebaut
- Wird automatisch als **RuntimeModelSnapshot** erfasst, wenn eine vollständige Konfiguration erkannt wird
- Ermöglicht Wiederverwendung ohne erneute Eingabe von Anmeldeinformationen

### RuntimeModelSnapshot-Lebenszyklus

Wenn Sie ein Modell ohne Verwendung von `modelProviders` konfigurieren, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um Ihre Konfiguration zu speichern:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Der Snapshot:

- Erfasst Modell-ID, API-Schlüssel, Basis-URL und Generierungskonfiguration
- Bleibt über Sitzungen hinweg bestehen (wird während der Laufzeit im Speicher gespeichert)
- Erscheint in der `/model`-Befehlsliste als Runtime-Option
- Kann mit `/model $runtime|openai|my-custom-model` ausgewählt werden

### Hauptunterschiede

| Aspect                      | Provider Model                    | Runtime Model                              |
| --------------------------- | --------------------------------- | ------------------------------------------ |
| Konfigurationsquelle        | `modelProviders` in Einstellungen | CLI, Env, Einstellungsebenen               |
| Konfigurationsatomarität    | Vollständiges, undurchlässiges Paket | Geschichtet, jedes Feld wird unabhängig aufgelöst |
| Wiederverwendbarkeit        | Immer in der `/model`-Liste verfügbar | Als Snapshot erfasst, erscheint bei Vollständigkeit |
| Team-Sharing                | Ja (über eingestellte Einstellungen) | Nein (benutzerlokal)                        |
| Anmeldeinformationsspeicher | Nur Referenz über `envKey`        | Kann den tatsächlichen Schlüssel im Snapshot erfassen |

### Wann was verwendet werden sollte

- **Verwenden Sie Provider-Modelle, wenn**: Sie Standardmodelle haben, die im Team geteilt werden, konsistente Konfigurationen benötigen oder versehentliche Überschreibungen verhindern möchten
- **Verwenden Sie Runtime-Modelle, wenn**: Sie schnell ein neues Modell testen, temporäre Anmeldeinformationen verwenden oder mit Ad-hoc-Endpunkten arbeiten

## Auswahlpersistenz und Empfehlungen

> [!important]
>
> Definieren Sie `modelProviders` nach Möglichkeit im Benutzerbereich `~/.qwen/settings.json` und vermeiden Sie es, Anmeldeinformationsüberschreibungen in einem Bereich zu speichern. Die Aufbewahrung des Provider-Katalogs in den Benutzereinstellungen verhindert Merge-/Override-Konflikte zwischen Projekt- und Benutzerbereichen und stellt sicher, dass `/auth`- und `/model`-Aktualisierungen immer in einen konsistenten Bereich zurückgeschrieben werden.

- `/model` und `/auth` speichern `model.name` (wo zutreffend) und `security.auth.selectedType` im nächstgelegenen beschreibbaren Bereich, der bereits `modelProviders` definiert; andernfalls fallen sie auf den Benutzerbereich zurück. Dadurch bleiben Arbeitsbereichs-/Benutzerdateien mit dem aktiven Provider-Katalog synchron.
- Ohne `modelProviders` mischt der Resolver CLI-/Env-/Einstellungsebenen und erstellt Runtime-Modelle. Das ist für Single-Provider-Setups in Ordnung, aber umständlich, wenn häufig gewechselt wird. Definieren Sie Provider-Kataloge immer dann, wenn Multi-Modell-Workflows üblich sind, damit Wechsel atomar, quellenattribuiert und debugfähig bleiben.
