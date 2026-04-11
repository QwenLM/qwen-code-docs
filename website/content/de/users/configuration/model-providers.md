# Modell-Provider

Qwen Code ermöglicht es dir, mehrere Modell-Provider über die `modelProviders`-Einstellung in deiner `settings.json` zu konfigurieren. Dadurch kannst du mit dem `/model`-Befehl zwischen verschiedenen KI-Modellen und Providern wechseln.

## Übersicht

Verwende `modelProviders`, um kuratierte Modelllisten pro Auth-Typ zu deklarieren, zwischen denen die `/model`-Auswahl wechseln kann. Die Schlüssel müssen gültige Auth-Typen sein (`openai`, `anthropic`, `gemini` usw.). Jeder Eintrag erfordert eine `id` und **muss `envKey` enthalten**, wobei `name`, `description`, `baseUrl` und `generationConfig` optional sind. Anmeldedaten werden niemals in den Einstellungen gespeichert; die Laufzeitumgebung liest sie aus `process.env[envKey]`. Qwen OAuth-Modelle bleiben fest codiert und können nicht überschrieben werden.

> [!note]
>
> Nur der `/model`-Befehl macht nicht-standardmäßige Auth-Typen verfügbar. Anthropic, Gemini usw. müssen über `modelProviders` definiert werden. Der `/auth`-Befehl listet Qwen OAuth, Alibaba Cloud Coding Plan und API Key als integrierte Authentifizierungsoptionen auf.

> [!warning]
>
> **Doppelte Modell-IDs innerhalb desselben authType:** Das Definieren mehrerer Modelle mit derselben `id` unter einem einzigen `authType` (z. B. zwei Einträge mit `"id": "gpt-4o"` in `openai`) wird derzeit nicht unterstützt. Wenn Duplikate vorhanden sind, **gewinnt das erste Vorkommen** und nachfolgende Duplikate werden mit einer Warnung übersprungen. Beachte, dass das `id`-Feld sowohl als Konfigurationsbezeichner als auch als tatsächlicher Modellname verwendet wird, der an die API gesendet wird. Daher ist die Verwendung eindeutiger IDs (z. B. `gpt-4o-creative`, `gpt-4o-balanced`) keine praktikable Umgehungslösung. Dies ist eine bekannte Einschränkung, die wir in einem zukünftigen Release beheben werden.

## Konfigurationsbeispiele nach Auth-Typ

Im Folgenden findest du umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen, die die verfügbaren Parameter und deren Kombinationen zeigen.

### Unterstützte Auth-Typen

Die Schlüssel des `modelProviders`-Objekts müssen gültige `authType`-Werte sein. Derzeit werden folgende Auth-Typen unterstützt:

| Auth Type    | Beschreibung                                                                             |
| ------------ | --------------------------------------------------------------------------------------- |
| `openai`     | OpenAI-kompatible APIs (OpenAI, Azure OpenAI, lokale Inference-Server wie vLLM/Ollama) |
| `anthropic`  | Anthropic Claude API                                                                    |
| `gemini`     | Google Gemini API                                                                       |
| `qwen-oauth` | Qwen OAuth (fest codiert, kann nicht in `modelProviders` überschrieben werden)                       |

> [!warning]
> Wenn ein ungültiger Auth-Typ-Schlüssel verwendet wird (z. B. ein Tippfehler wie `"openai-custom"`), wird die Konfiguration **stillschweigend übersprungen** und die Modelle erscheinen nicht in der `/model`-Auswahl. Verwende immer einen der oben aufgeführten unterstützten Auth-Typ-Werte.

### Für API-Anfragen verwendete SDKs

Qwen Code verwendet die folgenden offiziellen SDKs, um Anfragen an jeden Provider zu senden:

| Auth Type    | SDK-Paket                                                                                     |
| ------------ | ----------------------------------------------------------------------------------------------- |
| `openai`     | [`openai`](https://www.npmjs.com/package/openai) - Offizielles OpenAI Node.js SDK                  |
| `anthropic`  | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Offizielles Anthropic SDK |
| `gemini`     | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Offizielles Google GenAI SDK      |
| `qwen-oauth` | [`openai`](https://www.npmjs.com/package/openai) mit Custom Provider (DashScope-kompatibel)    |

Das bedeutet, dass die von dir konfigurierte `baseUrl` mit dem erwarteten API-Format des entsprechenden SDKs kompatibel sein muss. Wenn du beispielsweise den Auth-Typ `openai` verwendest, muss der Endpunkt Anfragen im OpenAI-API-Format akzeptieren.

### OpenAI-kompatible Provider (`openai`)

Dieser Auth-Typ unterstützt nicht nur die offizielle API von OpenAI, sondern auch jeden OpenAI-kompatiblen Endpunkt, einschließlich aggregierter Modell-Provider wie OpenRouter.

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
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Der Parameter `extra_body` wird **nur für OpenAI-kompatible Provider** (`openai`, `qwen-oauth`) unterstützt. Er wird für Anthropic- und Gemini-Provider ignoriert.

> [!note]
>
> **Zu `envKey`**: Das Feld `envKey` gibt den **Namen einer Umgebungsvariable** an, nicht den tatsächlichen API-Key-Wert. Damit die Konfiguration funktioniert, musst du sicherstellen, dass die entsprechende Umgebungsvariable mit deinem echten API-Key gesetzt ist. Dafür gibt es zwei Möglichkeiten:
>
> - **Option 1: Über eine `.env`-Datei** (aus Sicherheitsgründen empfohlen):
>   ```bash
>   # ~/.qwen/.env (oder Projekt-Root)
>   OPENAI_API_KEY=sk-your-actual-key-here
>   ```
>   Achte darauf, `.env` zu deiner `.gitignore` hinzuzufügen, um ein versehentliches Commiten von Secrets zu verhindern.
> - **Option 2: Über das `env`-Feld in `settings.json`** (wie in den obigen Beispielen gezeigt):
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

Der Alibaba Cloud Coding Plan bietet eine vorkonfigurierte Reihe von Qwen-Modellen, die für Coding-Aufgaben optimiert sind. Dieses Feature steht Nutzern mit API-Zugriff auf den Alibaba Cloud Coding Plan zur Verfügung und bietet ein vereinfachtes Setup mit automatischen Updates der Modellkonfiguration.

### Übersicht

Wenn du dich mit einem Alibaba Cloud Coding Plan API-Key über den `/auth`-Befehl authentifizierst, konfiguriert Qwen Code automatisch die folgenden Modelle:

| Modell-ID               | Name                 | Beschreibung                            |
| ---------------------- | -------------------- | -------------------------------------- |
| `qwen3.5-plus`         | qwen3.5-plus         | Fortgeschrittenes Modell mit aktiviertem Thinking   |
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

Die Modelle werden automatisch konfiguriert und deiner `/model`-Auswahl hinzugefügt.

### Regionen

Der Alibaba Cloud Coding Plan unterstützt zwei Regionen:

| Region               | Endpunkt                                        | Beschreibung             |
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

Die Modellkonfigurationen des Coding Plans sind versioniert. Wenn Qwen Code eine neuere Version der Modellvorlage erkennt, wirst du zum Update aufgefordert. Wenn du das Update akzeptierst, passiert Folgendes:

- Die bestehenden Coding-Plan-Modellkonfigurationen werden durch die neuesten Versionen ersetzt
- Alle manuell hinzugefügten benutzerdefinierten Modellkonfigurationen bleiben erhalten
- Es wird automatisch zum ersten Modell in der aktualisierten Konfiguration gewechselt

Der Update-Prozess stellt sicher, dass du immer Zugriff auf die neuesten Modellkonfigurationen und Features hast, ohne manuell eingreifen zu müssen.

### Manuelle Konfiguration (Fortgeschritten)

Wenn du Coding-Plan-Modelle lieber manuell konfigurieren möchtest, kannst du sie wie jeden anderen OpenAI-kompatiblen Provider zu deiner `settings.json` hinzufügen:

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
> Bei Verwendung der manuellen Konfiguration:
>
> - Du kannst einen beliebigen Umgebungsvariablennamen für `envKey` verwenden
> - Du musst `codingPlan.*` nicht konfigurieren
> - **Automatische Updates gelten nicht** für manuell konfigurierte Coding-Plan-Modelle

> [!warning]
>
> Wenn du zusätzlich die automatische Coding-Plan-Konfiguration verwendest, können automatische Updates deine manuellen Konfigurationen überschreiben, falls sie denselben `envKey` und dieselbe `baseUrl` wie die automatische Konfiguration verwenden. Um dies zu vermeiden, stelle sicher, dass deine manuelle Konfiguration nach Möglichkeit einen anderen `envKey` verwendet.

## Auflösungsebenen und Atomarität

Die effektiven Werte für Auth/Modell/Anmeldedaten werden pro Feld nach folgender Priorität ausgewählt (das erste vorhandene gewinnt). Du kannst `--auth-type` mit `--model` kombinieren, um direkt auf einen Provider-Eintrag zu verweisen; diese CLI-Flags werden vor anderen Ebenen ausgeführt.

| Ebene (höchste → niedrigste)   | authType                            | model                                           | apiKey                                              | baseUrl                                              | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatische Overrides     | `/auth`                             | `/auth`-Eingabe                                   | `/auth`-Eingabe                                       | `/auth`-Eingabe                                        | —                      | —                                 |
| Modell-Provider-Auswahl   | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                         | `modelProvider.baseUrl`                              | `modelProvider.envKey` | —                                 |
| CLI-Argumente              | `--auth-type`                       | `--model`                                       | `--openaiApiKey` (oder provider-spezifische Entsprechungen) | `--openaiBaseUrl` (oder provider-spezifische Entsprechungen) | —                      | —                                 |
| Umgebungsvariablen      | —                                   | Provider-spezifisches Mapping (z. B. `OPENAI_MODEL`) | Provider-spezifisches Mapping (z. B. `OPENAI_API_KEY`)   | Provider-spezifisches Mapping (z. B. `OPENAI_BASE_URL`)   | —                      | —                                 |
| Einstellungen (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                              | `security.auth.baseUrl`                              | —                      | —                                 |
| Standard / berechnet         | Fallback auf `AuthType.QWEN_OAUTH` | Eingebauter Standard (OpenAI ⇒ `qwen3-coder-plus`)  | —                                                   | —                                                    | —                      | `Config.getProxy()` falls konfiguriert |

\*Sofern vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmen `security.auth.selectedType` oder der implizite Standard den Auth-Typ. Qwen OAuth und OpenAI sind die einzigen Auth-Typen, die ohne zusätzliche Konfiguration verfügbar sind.

> [!warning]
>
> **Veraltung von `security.auth.apiKey` und `security.auth.baseUrl`:** Die direkte Konfiguration von API-Anmeldedaten über `security.auth.apiKey` und `security.auth.baseUrl` in `settings.json` ist veraltet. Diese Einstellungen wurden in historischen Versionen für über die UI eingegebene Anmeldedaten verwendet, der Eingabefluss für Anmeldedaten wurde jedoch in Version 0.10.1 entfernt. Diese Felder werden in einem zukünftigen Release vollständig entfernt. **Es wird dringend empfohlen, auf `modelProviders` zu migrieren** für alle Modell- und Anmeldedatenkonfigurationen. Verwende `envKey` in `modelProviders`, um auf Umgebungsvariablen für eine sichere Anmeldedatenverwaltung zu verweisen, anstatt Anmeldedaten hartcodiert in Einstellungsdateien zu speichern.

## Schichtung der Generation Config: Die undurchlässige Provider-Ebene

Die Konfigurationsauflösung folgt einem strengen Schichtungsmodell mit einer entscheidenden Regel: **Die modelProvider-Ebene ist undurchlässig (impermeable).**

### Funktionsweise

1. **Wenn ein modelProvider-Modell AUSGEWÄHLT wird** (z. B. über den `/model`-Befehl, der ein provider-konfiguriertes Modell auswählt):
   - Die gesamte `generationConfig` des Providers wird **atomar** angewendet
   - **Die Provider-Ebene ist vollständig undurchlässig** – untere Ebenen (CLI, env, Einstellungen) nehmen überhaupt nicht an der Auflösung von generationConfig teil
   - Alle in `modelProviders[].generationConfig` definierten Felder verwenden die Werte des Providers
   - Alle Felder, die **nicht** vom Provider definiert sind, werden auf `undefined` gesetzt (nicht von den Einstellungen geerbt)
   - Dies stellt sicher, dass Provider-Konfigurationen als vollständiges, in sich geschlossenes „versiegeltes Paket“ fungieren

2. **Wenn KEIN modelProvider-Modell ausgewählt wird** (z. B. bei Verwendung von `--model` mit einer rohen Modell-ID oder direkter Nutzung von CLI/env/Einstellungen):
   - Die Auflösung fällt auf untere Ebenen zurück
   - Felder werden aus CLI → env → Einstellungen → Standards befüllt
   - Dies erstellt ein **Runtime Model** (siehe nächster Abschnitt)

### Feldweise Priorität für `generationConfig`

| Priorität | Quelle                                        | Verhalten                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Programmatische Overrides                        | Laufzeit-Änderungen über `/model`, `/auth`                                                                        |
| 2        | `modelProviders[authType][].generationConfig` | **Undurchlässige Ebene** - ersetzt alle generationConfig-Felder vollständig; untere Ebenen nehmen nicht teil |
| 3        | `settings.model.generationConfig`             | Wird nur für **Runtime Models** verwendet (wenn kein Provider-Modell ausgewählt ist)                                    |
| 4        | Content-Generator-Standards                    | Provider-spezifische Standards (z. B. OpenAI vs. Gemini) - nur für Runtime Models                            |

### Atomare Feldbehandlung

Die folgenden Felder werden als atomare Objekte behandelt – Provider-Werte ersetzen das gesamte Objekt vollständig, es findet kein Merging statt:

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

Wenn `gpt-4o` aus modelProviders ausgewählt wird:

- `timeout` = 60000 (vom Provider, überschreibt Einstellungen)
- `samplingParams.temperature` = 0.2 (vom Provider, ersetzt das Einstellungsobjekt vollständig)
- `samplingParams.max_tokens` = **undefined** (nicht im Provider definiert, und die Provider-Ebene erbt nicht von den Einstellungen – Felder werden explizit auf undefined gesetzt, wenn sie nicht angegeben sind)

Bei Verwendung eines rohen Modells über `--model gpt-4` (nicht aus modelProviders, erstellt ein Runtime Model):

- `timeout` = 30000 (aus Einstellungen)
- `samplingParams.temperature` = 0.5 (aus Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus Einstellungen)

Die Merge-Strategie für `modelProviders` selbst ist REPLACE: Das gesamte `modelProviders` aus den Projekt-Einstellungen überschreibt den entsprechenden Abschnitt in den Benutzer-Einstellungen, anstatt die beiden zu mergen.

## Provider-Modelle vs. Runtime-Modelle

Qwen Code unterscheidet zwischen zwei Arten von Modellkonfigurationen:

### Provider-Modell

- Definiert in der `modelProviders`-Konfiguration
- Verfügt über ein vollständiges, atomares Konfigurationspaket
- Bei Auswahl wird die Konfiguration als undurchlässige Ebene angewendet
- Erscheint in der `/model`-Befehlsliste mit vollständigen Metadaten (Name, Beschreibung, Fähigkeiten)
- Empfohlen für Multi-Modell-Workflows und Team-Konsistenz

### Runtime-Modell

- Wird dynamisch erstellt, wenn rohe Modell-IDs über CLI (`--model`), Umgebungsvariablen oder Einstellungen verwendet werden
- Nicht in `modelProviders` definiert
- Konfiguration wird durch „Projektion“ durch die Auflösungsebenen aufgebaut (CLI → env → Einstellungen → Standards)
- Wird automatisch als **RuntimeModelSnapshot** erfasst, wenn eine vollständige Konfiguration erkannt wird
- Ermöglicht Wiederverwendung ohne erneute Eingabe von Anmeldedaten

### RuntimeModelSnapshot-Lebenszyklus

Wenn du ein Modell konfigurierst, ohne `modelProviders` zu verwenden, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um deine Konfiguration zu speichern:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openaiApiKey $KEY --openaiBaseUrl https://api.example.com/v1
```

Der Snapshot:

- Erfasst Modell-ID, API-Key, Base URL und Generation Config
- Bleibt über Sessions hinweg erhalten (während der Laufzeit im Speicher gespeichert)
- Erscheint in der `/model`-Befehlsliste als Runtime-Option
- Kann über `/model $runtime|openai|my-custom-model` gewechselt werden

### Wichtige Unterschiede

| Aspekt                  | Provider-Modell                    | Runtime-Modell                              |
| ----------------------- | --------------------------------- | ------------------------------------------ |
| Konfigurationsquelle    | `modelProviders` in Einstellungen      | CLI-, env-, Einstellungs-Ebenen                  |
| Konfigurationsatomarität | Vollständiges, undurchlässiges Paket     | Geschichtet, jedes Feld wird unabhängig aufgelöst |
| Wiederverwendbarkeit             | Immer in `/model`-Liste verfügbar | Als Snapshot erfasst, erscheint wenn vollständig  |
| Team-Freigabe            | Ja (über committete Einstellungen)      | Nein (benutzerlokal)                            |
| Anmeldedaten-Speicherung      | Nur Referenz über `envKey`       | Kann tatsächlichen Key im Snapshot erfassen         |

### Wann was verwendet werden sollte

- **Verwende Provider-Modelle**, wenn: Du Standardmodelle hast, die teamweit geteilt werden, konsistente Konfigurationen benötigst oder versehentliche Overrides verhindern möchtest
- **Verwende Runtime-Modelle**, wenn: Du schnell ein neues Modell testest, temporäre Anmeldedaten nutzt oder mit Ad-hoc-Endpunkten arbeitest

## Persistenz der Auswahl und Empfehlungen

> [!important]
>
> Definiere `modelProviders` nach Möglichkeit im benutzerbezogenen `~/.qwen/settings.json` und vermeide es, Credential-Overrides in einem beliebigen Scope zu persistieren. Den Provider-Katalog in den Benutzer-Einstellungen zu halten, verhindert Merge-/Override-Konflikte zwischen Projekt- und Benutzer-Scope und stellt sicher, dass `/auth`- und `/model`-Updates immer in einen konsistenten Scope zurückschreiben.

- `/model` und `/auth` persistieren `model.name` (wo zutreffend) und `security.auth.selectedType` im nächstgelegenen beschreibbaren Scope, der bereits `modelProviders` definiert; andernfalls fallen sie auf den Benutzer-Scope zurück. Dies hält Workspace-/Benutzerdateien mit dem aktiven Provider-Katalog synchron.
- Ohne `modelProviders` mischt der Resolver CLI-/env-/Einstellungs-Ebenen und erstellt Runtime-Modelle. Das ist für Single-Provider-Setups in Ordnung, wird aber beim häufigen Wechsel umständlich. Definiere Provider-Kataloge immer dann, wenn Multi-Modell-Workflows üblich sind, damit Wechsel atomar, quellattribuiert und debugbar bleiben.