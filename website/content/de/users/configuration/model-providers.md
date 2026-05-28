---
description: "Konfigurieren Sie Qwen Code modelProviders für OpenAI, Anthropic, Gemini und weitere Modelle, um API Keys, Modellwechsel und Team-Governance zu steuern."
---

# Modellanbieter

Qwen Code ermöglicht es dir, mehrere Modellanbieter über die `modelProviders`-Einstellung in deiner `settings.json` zu konfigurieren. Dadurch kannst du mit dem `/model`-Befehl zwischen verschiedenen KI-Modellen und Anbietern wechseln.

## Übersicht

Verwende `modelProviders`, um kuratierte Modelllisten pro Auth-Typ zu deklarieren, zwischen denen die `/model`-Auswahl wechseln kann. Die Schlüssel müssen gültige Auth-Typen sein (`openai`, `anthropic`, `gemini` usw.). Jeder Eintrag erfordert eine `id` und **muss `envKey` enthalten**, wobei `name`, `description`, `baseUrl` und `generationConfig` optional sind. Anmeldedaten werden niemals in den Einstellungen gespeichert; die Runtime liest sie aus `process.env[envKey]`. Qwen OAuth-Modelle bleiben fest codiert und können nicht überschrieben werden.

> [!note]
>
> Nur der `/model`-Befehl macht nicht-standardmäßige Auth-Typen verfügbar. Anthropic, Gemini usw. müssen über `modelProviders` definiert werden. Der `/auth`-Befehl listet Qwen OAuth, Alibaba Cloud Coding Plan und API Key als integrierte Authentifizierungsoptionen auf.

> [!warning]
>
> **Doppelte Modell-IDs innerhalb desselben `authType`:** Das Definieren mehrerer Modelle mit derselben `id` unter einem einzigen `authType` (z. B. zwei Einträge mit `"id": "gpt-4o"` in `openai`) wird derzeit nicht unterstützt. Wenn Duplikate vorhanden sind, **gewinnt das erste Vorkommen** und nachfolgende Duplikate werden mit einer Warnung übersprungen. Beachte, dass das `id`-Feld sowohl als Konfigurationsbezeichner als auch als tatsächlicher Modellname verwendet wird, der an die API gesendet wird. Daher ist die Verwendung eindeutiger IDs (z. B. `gpt-4o-creative`, `gpt-4o-balanced`) keine praktikable Lösung. Dies ist eine bekannte Einschränkung, die wir in einem zukünftigen Release beheben werden.

## Konfigurationsbeispiele nach Auth-Typ

Im Folgenden findest du umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen, die die verfügbaren Parameter und deren Kombinationen zeigen.

### Unterstützte Auth-Typen

Die Schlüssel des `modelProviders`-Objekts müssen gültige `authType`-Werte sein. Derzeit unterstützte Auth-Typen sind:

| Auth Type    | Beschreibung                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | OpenAI-kompatible APIs (OpenAI, Azure OpenAI, lokale Inference-Server wie vLLM/Ollama) |
| `anthropic`  | Anthropic Claude API                                                                    |
| `gemini`     | Google Gemini API                                                                       |
| `qwen-oauth` | Qwen OAuth (fest codiert, kann in `modelProviders` nicht überschrieben werden)                       |

> [!warning]
> Wenn ein ungültiger Auth-Typ-Schlüssel verwendet wird (z. B. ein Tippfehler wie `"openai-custom"`), wird die Konfiguration **still ignoriert** und die Modelle erscheinen nicht in der `/model`-Auswahl. Verwende immer einen der oben aufgeführten unterstützten Auth-Typ-Werte.

### Für API-Anfragen verwendete SDKs

Qwen Code verwendet die folgenden offiziellen SDKs, um Anfragen an die einzelnen Anbieter zu senden:

| Auth Type    | SDK Package                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - Offizielles OpenAI Node.js SDK                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Offizielles Anthropic SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Offizielles Google GenAI SDK      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) mit benutzerdefiniertem Provider (DashScope-kompatibel)    |

Das bedeutet, dass die konfigurierte `baseUrl` mit dem vom jeweiligen SDK erwarteten API-Format kompatibel sein muss. Wenn du beispielsweise den Auth-Typ `openai` verwendest, muss der Endpunkt Anfragen im OpenAI-API-Format akzeptieren.

### OpenAI-kompatible Anbieter (`openai`)

Dieser Auth-Typ unterstützt nicht nur die offizielle API von OpenAI, sondern auch jeden OpenAI-kompatiblen Endpunkt, einschließlich aggregierter Modellanbieter wie OpenRouter.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here",
    "OPENROUTER_API_KEY": "sk-or-your-actual-openrouter-key-here"
  },
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
      }
    ]
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
  "env": {
    "GEMINI_API_KEY": "AIza-your-actual-gemini-key-here"
  },
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

### Lokale selbst gehostete Modelle (über OpenAI-kompatible API)

Die meisten lokalen Inference-Server (vLLM, Ollama, LM Studio usw.) bieten einen OpenAI-kompatiblen API-Endpunkt. Konfiguriere sie mit dem Auth-Typ `openai` und einer lokalen `baseUrl`:

```json
{
  "env": {
    "OLLAMA_API_KEY": "ollama",
    "VLLM_API_KEY": "not-needed",
    "LMSTUDIO_API_KEY": "lm-studio"
  },
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

Für lokale Server, die keine Authentifizierung erfordern, kannst du einen beliebigen Platzhalterwert für den API-Key verwenden:

```bash
# Für Ollama (keine Authentifizierung erforderlich)
export OLLAMA_API_KEY="ollama"

# Für vLLM (wenn keine Authentifizierung konfiguriert ist)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Der `extra_body`-Parameter wird **nur für OpenAI-kompatible Anbieter** (`openai`, `qwen-oauth`) unterstützt. Er wird für Anthropic- und Gemini-Anbieter ignoriert.

> [!note]
>
> **Zu `envKey`**: Das `envKey`-Feld gibt den **Namen einer Umgebungsvariablen** an, nicht den tatsächlichen API-Key-Wert. Damit die Konfiguration funktioniert, musst du sicherstellen, dass die entsprechende Umgebungsvariable mit deinem echten API-Key gesetzt ist. Dafür gibt es zwei Möglichkeiten:
>
> - **Option 1: Über eine `.env`-Datei** (aus Sicherheitsgründen empfohlen):
>   ```bash
>   # ~/.qwen/.env (oder Projekt-Root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Füge `.env` unbedingt zu deiner `.gitignore` hinzu, um zu verhindern, dass Secrets versehentlich committet werden.
> - **Option 2: Über das `env`-Feld in `settings.json`** (wie in den obigen Beispielen gezeigt):
>   ```json
>   {
>     "env": {
>       "OPENAI_API_KEY": "sk-your-actual-key-here"
>     }
>   }
>   ```
>
> Jedes Anbieterbeispiel enthält ein `env`-Feld, um zu veranschaulichen, wie der API-Key konfiguriert werden sollte.

## Alibaba Cloud Coding Plan

Der Alibaba Cloud Coding Plan bietet einen vorkonfigurierten Satz von Qwen-Modellen, die für Coding-Aufgaben optimiert sind. Dieses Feature ist für Nutzer mit Alibaba Cloud Coding Plan API-Zugriff verfügbar und bietet ein vereinfachtes Setup-Erlebnis mit automatischen Modellkonfigurations-Updates.

### Übersicht

Wenn du dich mit einem Alibaba Cloud Coding Plan API-Key über den `/auth`-Befehl authentifizierst, konfiguriert Qwen Code automatisch die folgenden Modelle:

| Model ID               | Name                 | Beschreibung                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Erweitertes Modell mit aktiviertem Thinking   |
| `qwen3-coder-plus`     | qwen3-coder-plus     | Optimiert für Coding-Aufgaben             |
| `qwen3-max-2026-01-23` | qwen3-max-2026-01-23 | Neuestes Max-Modell mit aktiviertem Thinking |

### Einrichtung

1. Hole dir einen Alibaba Cloud Coding Plan API-Key:
   - **China**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
   - **International**: <https://modelstudio.console.alibabacloud.com/?tab=dashboard#/efm/coding_plan>
2. Führe den `/auth`-Befehl in Qwen Code aus
3. Wähle **Alibaba Cloud Coding Plan**
4. Wähle deine Region
5. Gib deinen API-Key ein, wenn du dazu aufgefordert wirst

Die Modelle werden automatisch konfiguriert und zu deiner `/model`-Auswahl hinzugefügt.

### Regionen

Der Alibaba Cloud Coding Plan unterstützt zwei Regionen:

| Region               | Endpoint                                        | Beschreibung             |
| -------------------- | ----------------------------------------------- | ----------------------- |
| China                | `https://coding.dashscope.aliyuncs.com/v1`      | Endpunkt für Festlandchina |
| Global/International | `https://coding-intl.dashscope.aliyuncs.com/v1` | Internationaler Endpunkt  |

Die Region wird während der Authentifizierung ausgewählt und in `settings.json` unter `codingPlan.region` gespeichert. Um die Region zu wechseln, führe den `/auth`-Befehl erneut aus und wähle eine andere Region.

### API-Key-Speicherung

Wenn du den Coding Plan über den `/auth`-Befehl konfigurierst, wird der API-Key unter dem reservierten Umgebungsvariablennamen `BAILIAN_CODING_PLAN_API_KEY` gespeichert. Standardmäßig wird er im `env`-Feld deiner `settings.json`-Datei gespeichert.

> [!warning]
>
> **Sicherheitsempfehlung**: Aus Sicherheitsgründen wird empfohlen, den API-Key aus `settings.json` in eine separate `.env`-Datei zu verschieben und als Umgebungsvariable zu laden. Beispiel:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Stelle dann sicher, dass diese Datei zu deiner `.gitignore` hinzugefügt wird, wenn du projektbezogene Einstellungen verwendest.

### Automatische Updates

Die Modellkonfigurationen des Coding Plans sind versioniert. Wenn Qwen Code eine neuere Version der Modellvorlage erkennt, wirst du zum Update aufgefordert. Wenn du das Update akzeptierst, wird:

- Die bestehenden Coding-Plan-Modellkonfigurationen durch die neuesten Versionen ersetzt
- Alle manuell hinzugefügten benutzerdefinierten Modellkonfigurationen beibehalten
- Automatisch zum ersten Modell in der aktualisierten Konfiguration gewechselt

Der Update-Prozess stellt sicher, dass du immer Zugriff auf die neuesten Modellkonfigurationen und Features hast, ohne manuell eingreifen zu müssen.

### Manuelle Konfiguration (Fortgeschritten)

Wenn du Coding-Plan-Modelle lieber manuell konfigurieren möchtest, kannst du sie wie jeden OpenAI-kompatiblen Anbieter zu deiner `settings.json` hinzufügen:

```json
{
  "modelProviders": {
    "openai": [
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
> Wenn du zusätzlich die automatische Coding-Plan-Konfiguration verwendest, können automatische Updates deine manuellen Konfigurationen überschreiben, falls sie denselben `envKey` und dieselbe `baseUrl` wie die automatische Konfiguration verwenden. Um dies zu vermeiden, stelle sicher, dass deine manuelle Konfiguration nach Möglichkeit einen anderen `envKey` verwendet.

## Auflösungsebenen und Atomarität

Die effektiven Werte für Auth/Modell/Anmeldedaten werden pro Feld nach der folgenden Priorität ausgewählt (das erste vorhandene gewinnt). Du kannst `--auth-type` mit `--model` kombinieren, um direkt auf einen Anbietereintrag zu verweisen; diese CLI-Flags werden vor anderen Ebenen ausgeführt.

| Layer (highest → lowest)   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatic overrides     | `/auth`                             | `/auth` input                                   | `/auth` input                                       | `/auth` input                                        | —                      | —                                 |
| Model provider selection   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI arguments              | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (or provider-specific equivalents) | `--openaiBaseUrl` (or provider-specific equivalents) | —                      | —                                 |
| Environment variables      | —                                   | Provider-specific mapping (e.g. `OPENAI_MODEL`) | Provider-specific mapping (e.g. `OPENAI_API_KEY`)   | Provider-specific mapping (e.g. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Settings (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Default / computed         | Falls back to `AuthType.QWEN_OAUTH` | Built-in default (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` if configured |

\*Wenn vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmen `security.auth.selectedType` oder der implizite Standard den Auth-Typ. Qwen OAuth und OpenAI sind die einzigen Auth-Typen, die ohne zusätzliche Konfiguration verfügbar sind.

> [!warning]
>
> **Veraltung von `security.auth.apiKey` und `security.auth.baseUrl`:** Die direkte Konfiguration von API-Anmeldedaten über `security.auth.apiKey` und `security.auth.baseUrl` in `settings.json` ist veraltet. Diese Einstellungen wurden in früheren Versionen für über die UI eingegebene Anmeldedaten verwendet, der Eingabefluss für Anmeldedaten wurde jedoch in Version 0.10.1 entfernt. Diese Felder werden in einem zukünftigen Release vollständig entfernt. **Es wird dringend empfohlen, auf `modelProviders` zu migrieren** für alle Modell- und Anmeldedatenkonfigurationen. Verwende `envKey` in `modelProviders`, um auf Umgebungsvariablen für eine sichere Anmeldedatenverwaltung zu verweisen, anstatt Anmeldedaten hart in Einstellungsdateien zu codieren.

## Schichtung der Generation Config: Die undurchlässige Provider-Ebene

Die Konfigurationsauflösung folgt einem strengen Schichtmodell mit einer entscheidenden Regel: **Die `modelProvider`-Ebene ist undurchlässig**.

### Funktionsweise

1. **Wenn ein `modelProvider`-Modell AUSGEWÄHLT wird** (z. B. über den `/model`-Befehl, der ein anbieterkonfiguriertes Modell auswählt):
   - Die gesamte `generationConfig` des Anbieters wird **atomar** angewendet
   - **Die Provider-Ebene ist vollständig undurchlässig** — untere Ebenen (CLI, env, settings) beteiligen sich überhaupt nicht an der `generationConfig`-Auflösung
   - Alle in `modelProviders[].generationConfig` definierten Felder verwenden die Werte des Anbieters
   - Alle vom Anbieter **nicht definierten** Felder werden auf `undefined` gesetzt (nicht von den Einstellungen übernommen)
   - Dies stellt sicher, dass Anbieterkonfigurationen als vollständiges, in sich geschlossenes „versiegeltes Paket“ wirken

2. **Wenn KEIN `modelProvider`-Modell ausgewählt wird** (z. B. bei Verwendung von `--model` mit einer raw Modell-ID oder direkter Nutzung von CLI/env/settings):
   - Die Auflösung fällt auf die unteren Ebenen zurück
   - Felder werden aus CLI → env → settings → defaults befüllt
   - Dadurch entsteht ein **Runtime Model** (siehe nächster Abschnitt)

### Priorität pro Feld für `generationConfig`

| Priority | Source                                        | Behavior                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Programmatic overrides                        | Runtime `/model`, `/auth` changes                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **Undurchlässige Ebene** - ersetzt alle `generationConfig`-Felder vollständig; untere Ebenen beteiligen sich nicht |
| 3        | `settings.model.generationConfig`             | Wird nur für **Runtime Models** verwendet (wenn kein Provider-Modell ausgewählt ist)                                    |
| 4        | Content-generator defaults                    | Anbieterspezifische Defaults (z. B. OpenAI vs Gemini) - nur für Runtime Models                            |

### Atomare Feldbehandlung

Die folgenden Felder werden als atomare Objekte behandelt – Anbieterwerte ersetzen das gesamte Objekt vollständig, es erfolgt kein Merging:

- `samplingParams` - Temperature, top_p, max_tokens usw.
- `customHeaders` - Benutzerdefinierte HTTP-Header
- `extra_body` - Zusätzliche Request-Body-Parameter

### Beispiel

```json
// User settings (~/.qwen/settings.json)
{
  "model": {
    "generationConfig": {
      "timeout": 30000,
      "samplingParams": { "temperature": 0.5, "max_tokens": 1000 }
    }
  }
}

// modelProviders configuration
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

- `timeout` = 60000 (vom Anbieter, überschreibt Einstellungen)
- `samplingParams.temperature` = 0.2 (vom Anbieter, ersetzt das Einstellungsobjekt vollständig)
- `samplingParams.max_tokens` = **undefined** (nicht im Anbieter definiert, und die Provider-Ebene übernimmt nichts von den Einstellungen – Felder werden explizit auf undefined gesetzt, wenn sie nicht bereitgestellt werden)

Bei Verwendung eines raw Modells über `--model gpt-4` (nicht aus `modelProviders`, erstellt ein Runtime Model):

- `timeout` = 30000 (aus Einstellungen)
- `samplingParams.temperature` = 0.5 (aus Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus Einstellungen)

Die Merge-Strategie für `modelProviders` selbst ist REPLACE: Das gesamte `modelProviders` aus den Projekteinstellungen überschreibt den entsprechenden Abschnitt in den Benutzereinstellungen, anstatt beide zu mergen.

## Reasoning / Thinking-Konfiguration

Das optionale `reasoning`-Feld unter `generationConfig` steuert, wie intensiv das Modell vor der Antwort reasoning betreibt. Die Anthropic- und Gemini-Converter berücksichtigen es immer. Die OpenAI-kompatible Pipeline berücksichtigt es **nur, wenn** `generationConfig.samplingParams` nicht gesetzt ist – siehe den Hinweis „Interaktion mit `samplingParams`“ weiter unten.

```jsonc
{
  "modelProviders": {
    "openai": [
      {
        "id": "deepseek-v4-pro",
        "name": "DeepSeek V4 Pro",
        "baseUrl": "https://api.deepseek.com/v1",
        "envKey": "DEEPSEEK_API_KEY",
        "generationConfig": {
          // The four-tier scale:
          //   'low'    | 'medium' — server-mapped to 'high' on DeepSeek
          //   'high'   — default reasoning intensity
          //   'max'    — DeepSeek-specific extra-strong tier
          // Or set `false` to disable reasoning entirely.
          "reasoning": { "effort": "max" },
        },
      },
    ],
  },
}
```

### Verhalten pro Anbieter

| Protocol / provider                          | Wire-Format                                                           | Notes                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DeepSeek** (`api.deepseek.com`)   | Flat `reasoning_effort: <effort>` body parameter                     | Wenn `reasoning.effort` in der verschachtelten Konfiguration gesetzt ist, wird es in das flache `reasoning_effort` umgeschrieben und `'low'`/`'medium'` werden zu `'high'`, `'xhigh'` zu `'max'` normalisiert – entsprechend der [serverseitigen Back-Compat](https://api-docs.deepseek.com/zh-cn/api/create-chat-completion) von DeepSeek. Top-level `samplingParams.reasoning_effort` oder `extra_body.reasoning_effort` überschreiben diese Normalisierung und werden unverändert gesendet. |
| **OpenAI** (other compatible servers)        | `reasoning: { effort, ... }` passed through verbatim                 | Setze es über `samplingParams` (z. B. `samplingParams.reasoning_effort` für GPT-5/o-Serie), wenn der Anbieter ein anderes Format erwartet.                                                                                                                                                                                                                                                                                                |
| **Anthropic** (real `api.anthropic.com`)     | `output_config: { effort }` plus the `effort-2025-11-24` beta header | Das echte Anthropic akzeptiert nur `'low'`/`'medium'`/`'high'`. `'max'` wird **auf `'high'` gekürzt** mit einer `debugLogger.warn`-Zeile (einmal pro Generator); wenn du maximale Intensität möchtest, wechsle die baseURL zu einem DeepSeek-kompatiblen Endpunkt, der dies unterstützt.                                                                                                                                                                                  |
| **Anthropic** (`api.deepseek.com/anthropic`) | Same `output_config: { effort }` + beta header                       | `'max'` wird unverändert weitergeleitet.                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                 | `thinkingConfig: { includeThoughts: true, thinkingLevel }`           | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, andere → `THINKING_LEVEL_UNSPECIFIED` (Gemini hat keine `MAX`-Stufe).                                                                                                                                                                                                                                                                                                                    |

### `reasoning: false`

Das Setzen von `reasoning: false` (der boolesche Literalwert) deaktiviert Thinking explizit bei jedem Anbieter – nützlich für günstige Nebenabfragen, die nicht von Reasoning profitieren. Dies wird auch auf Request-Ebene über `request.config.thinkingConfig.includeThoughts: false` für einmalige Aufrufe (z. B. Vorschlagsgenerierung) berücksichtigt.

Bei einer `api.deepseek.com` baseURL gibt die OpenAI-Pipeline das explizite `thinking: { type: 'disabled' }`-Feld aus, das DeepSeek V4+ erfordert – der serverseitige Standard ist `'enabled'`, daher würde das bloße Weglassen von `reasoning_effort` weiterhin Thinking-Latenz/-Kosten verursachen. Selbst gehostete DeepSeek-Backends (sglang/vllm) und andere OpenAI-kompatible Server erhalten dieses Feld **nicht**; wenn du Thinking dort deaktivieren musst, injiziere `thinking: { type: 'disabled' }` (oder welchen Regler auch immer dein Inference-Framework bereitstellt) über `samplingParams`/`extra_body`.

### Interaktion mit `samplingParams` (nur OpenAI-kompatibel)

> [!warning]
>
> Wenn `generationConfig.samplingParams` bei einem OpenAI-kompatiblen Anbieter gesetzt ist, sendet die Pipeline diese Schlüssel **unverändert** an die Wire und überspringt die separate `reasoning`-Injektion vollständig. Eine Konfiguration wie `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` wird das Reasoning-Feld bei OpenAI/DeepSeek-Anfragen also stillschweigend verwerfen.
>
> Wenn du `samplingParams` setzt, füge den Reasoning-Regler direkt darin ein – für DeepSeek ist das `samplingParams.reasoning_effort`, für GPT-5/o-Serie ist es `samplingParams.reasoning_effort` (ihr flaches Feld) oder `samplingParams.reasoning` (das verschachtelte Objekt). Für OpenRouter und andere Anbieter variiert der Feldname; konsultiere die Anbieterdokumentation.
>
> Die Anthropic- und Gemini-Converter sind davon nicht betroffen – sie lesen `reasoning.effort` immer direkt, unabhängig von `samplingParams`.

### `budget_tokens`

Du kannst ein exaktes Thinking-Token-Budget festlegen, indem du `budget_tokens` neben `effort` angibst:

```jsonc
"reasoning": { "effort": "high", "budget_tokens": 50000 }
```

Für Anthropic wird daraus `thinking.budget_tokens`. Für OpenAI/DeepSeek wird das Feld beibehalten, aber derzeit vom Server ignoriert – `reasoning_effort` ist der maßgebliche Parameter.

## Provider Models vs. Runtime Models

Qwen Code unterscheidet zwischen zwei Arten von Modellkonfigurationen:

### Provider Model

- In der `modelProviders`-Konfiguration definiert
- Besitzt ein vollständiges, atomares Konfigurationspaket
- Bei Auswahl wird seine Konfiguration als undurchlässige Ebene angewendet
- Erscheint in der `/model`-Befehlsliste mit vollständigen Metadaten (Name, Beschreibung, Fähigkeiten)
- Empfohlen für Multi-Modell-Workflows und Teamkonsistenz

### Runtime Model

- Wird dynamisch erstellt, wenn raw Modell-IDs über CLI (`--model`), Umgebungsvariablen oder Einstellungen verwendet werden
- Nicht in `modelProviders` definiert
- Die Konfiguration wird durch „Projektion“ über die Auflösungsebenen (CLI → env → settings → defaults) aufgebaut
- Wird automatisch als **RuntimeModelSnapshot** erfasst, wenn eine vollständige Konfiguration erkannt wird
- Ermöglicht Wiederverwendung ohne erneute Eingabe der Anmeldedaten

### RuntimeModelSnapshot-Lebenszyklus

Wenn du ein Modell konfigurierst, ohne `modelProviders` zu verwenden, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um deine Konfiguration zu speichern:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Der Snapshot:

- Erfasst Modell-ID, API-Key, Base URL und Generation Config
- Bleibt über Sessions hinweg erhalten (während der Runtime im Speicher gespeichert)
- Erscheint in der `/model`-Befehlsliste als Runtime-Option
- Kann über `/model $runtime|openai|my-custom-model` gewechselt werden

### Wichtige Unterschiede

| Aspekt                  | Provider Model                    | Runtime Model                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Konfigurationsquelle    | `modelProviders` in settings      | CLI-, env-, settings-Ebenen                  |
| Konfigurationsatomarität | Vollständiges, undurchlässiges Paket     | Geschichtet, jedes Feld wird unabhängig aufgelöst |
| Wiederverwendbarkeit             | Immer in `/model`-Liste verfügbar | Als Snapshot erfasst, erscheint wenn vollständig  |
| Team-Sharing            | Ja (über committete Settings)      | Nein (benutzerlokal)                            |
| Anmeldedatenspeicherung      | Nur Referenz über `envKey`       | Kann tatsächlichen Key im Snapshot erfassen         |

### Wann was verwenden

- **Verwende Provider Models**, wenn: Du Standardmodelle hast, die teamübergreifend geteilt werden, konsistente Konfigurationen benötigst oder versehentliche Überschreibungen verhindern möchtest
- **Verwende Runtime Models**, wenn: Du schnell ein neues Modell testest, temporäre Anmeldedaten verwendest oder mit Ad-hoc-Endpunkten arbeitest

## Auswahl-Persistenz und Empfehlungen

> [!important]
>
> Definiere `modelProviders` nach Möglichkeit im Benutzer-Scope `~/.qwen/settings.json` und vermeide es, Credential-Overrides in einem beliebigen Scope zu persistieren. Das Provider-Katalog im Benutzer-Scope zu halten, verhindert Merge-/Überschreibungskonflikte zwischen Projekt- und Benutzer-Scope und stellt sicher, dass `/auth`- und `/model`-Updates immer in einen konsistenten Scope zurückschreiben.

- `/model` und `/auth` persistieren `model.name` (wo anwendbar) und `security.auth.selectedType` im nächstgelegenen beschreibbaren Scope, der bereits `modelProviders` definiert; andernfalls fallen sie auf den Benutzer-Scope zurück. Dies hält Workspace-/Benutzerdateien mit dem aktiven Provider-Katalog synchron.
- Ohne `modelProviders` mischt der Resolver CLI-/env-/settings-Ebenen und erstellt Runtime Models. Das ist für Single-Provider-Setups in Ordnung, aber umständlich bei häufigem Wechsel. Definiere Provider-Kataloge immer dann, wenn Multi-Modell-Workflows üblich sind, damit Wechsel atomar, quellzugeordnet und debugbar bleiben.