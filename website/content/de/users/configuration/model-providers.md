# Modellanbieter

Mit Qwen Code kannst du mehrere Model-Provider über die `modelProviders`-Einstellung in deiner `settings.json` konfigurieren. So kannst du mit dem `/model`-Befehl zwischen verschiedenen KI-Modellen und -Providern wechseln.

## Übersicht

Verwenden Sie `modelProviders`, um Modelle pro Anbieter-ID zu deklarieren, zwischen denen die `/model`-Auswahl wechseln kann. Jeder Schlüssel ist eine Anbieter-ID und sein Wert ist **ein Array von Modelldefinitionen** (`ModelConfig[]`). Für integrierte Anbieter muss der Schlüssel ein gültiger Authentifizierungstyp sein (`openai`, `anthropic`, `gemini`, `vertex-ai`); eine benutzerdefinierte Anbieter-ID (z. B. `idealab`) ist zulässig, solange Sie sie über die oberste [`providerProtocol`](#custom-provider-ids-providerprotocol)-Einstellung einem Protokoll zuordnen. Jeder Modelleintrag erfordert ein `id`; `envKey` ist **optional und empfohlen** (wenn weggelassen, wird auf den Standard-Umgebungsschlüssel des Authentifizierungstyps zurückgegriffen, z. B. `OPENAI_API_KEY` für `openai`), mit optionalen `name`, `description`, `baseUrl` und `generationConfig`. Zugangsdaten werden niemals in Einstellungen gespeichert; die Laufzeitumgebung liest sie aus `process.env[envKey]`. Ältere kostenlose Qwen OAuth-Modelle bleiben hartcodiert und können nicht überschrieben werden.

> [!note]
>
> Frühere Previews haben die Modelle jedes Providers in ein `{ "protocol": ..., "models": [...] }`-Objekt eingeschlossen. Diese Form wurde rückgängig gemacht — der aktuelle Wert ist das nackte `ModelConfig[]`-Array, das auf dieser Seite durchgehend gezeigt wird. Ein umhüllender Eintrag in einer bereits migrierten (`$version: 4`) Einstellungsdatei wird stillschweigend übersprungen, also aktualisiere alle alten Konfigurationen auf das Array-Format.

> [!note]
>
> Konfigurieren Sie API-Schlüssel-Anbieter über `modelProviders` und wählen Sie sie dann mit `/model` aus. Für die Anmeldung mit dem Qwen-Konto wählen Sie [**Qwen Account with Subscription**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) in `/auth`; es sind kein API-Schlüssel oder manuelle `modelProviders`-Konfiguration erforderlich. Verwenden Sie `/model`, um aus den mit Ihrem Abonnement verfügbaren Modellen zu wählen. Siehe [Authentication](./auth.md) für Anmeldeanweisungen.

> [!note]
>
> **Modell-Eindeutigkeit:** Modelle werden durch ihr effektives API-Protokoll, `id` und konfiguriertes `baseUrl` identifiziert. Sie können dasselbe Modell und dieselbe URL sowohl mit `wireApi: "chat-completions"` als auch mit `wireApi: "responses"` definieren oder verschiedene URLs für dasselbe Modell und dieselbe API verwenden. Wenn Einträge alle drei Werte gemeinsam haben, gewinnt das erste Vorkommen und nachfolgende Duplikate werden mit einer Warnung übersprungen.

> [!note]
>
> **Hot Reload vs. Neustart:** `modelProviders`-Änderungen in `settings.json` werden von einer laufenden interaktiven Sitzung ohne Neustart übernommen (der Datei-Watcher entprellt ~300ms; öffnen Sie `/model` erneut, um neue Einträge zu sehen, die aktuelle Auswahl bleibt erhalten). Eine Änderung des `wireApi` des aktiven Modells erstellt eine andere Route; wählen Sie diese Route explizit aus oder starten Sie neu, um sie zu verwenden. Ungültige API-Änderungen lassen das vorherige Registry nutzbar. `providerProtocol` wird einmal beim Start gelesen und **erfordert einen Neustart**.

### Bildgenerierung-Routen

Legen Sie `supportsImageGeneration: true` fest, wenn eine Route vom integrierten `image_gen`-Tool verwendet werden kann. Diese Fähigkeit ist unabhängig von der Unterstützung für Bildeingaben wie `capabilities.vision` oder `generationConfig.modalities.image`.

Verwenden Sie `imageOnly: true`, wenn die Route ausschließlich für die Bildgenerierung gedacht ist und nicht in normalen Modellauswahlen erscheinen darf. Aus Gründen der Abwärtskompatibilität impliziert `imageOnly: true` auch die Fähigkeit zur Bildgenerierung, sodass vorhandene Einstellungen nicht migriert werden müssen.

Eine Dual-Rolle-Route kann sowohl als Hauptmodell als auch über `/model --image` ausgewählt werden:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "omni-model",
        "envKey": "MODEL_API_KEY",
        "baseUrl": "https://gateway.example.com/model-api",
        "supportsImageGeneration": true
      }
    ]
  }
}
```

Eine dedizierte Bild-Route legt beide Felder fest. Das Legacy-Format mit nur `imageOnly: true` bleibt gültig:

```json
{
  "id": "image-model",
  "envKey": "MODEL_API_KEY",
  "baseUrl": "https://images.example.com/api/v1",
  "supportsImageGeneration": true,
  "imageOnly": true
}
```

Die ausgewählte Route muss ein explizites HTTPS-`baseUrl` und ein nicht-leeres `envKey` deklarieren. Die Bildgenerierung verwendet denselben Endpunkt und dieselbe Berechtigung wie die Route; wenn Chat und Bildgenerierung unterschiedliche Endpunkte oder Berechtigungen erfordern, konfigurieren Sie stattdessen zwei Routen.

### Live Voice Routen

Legen Sie `realtimeOnly: true` auf einer Route fest, die das DashScope Realtime (Speech-to-Speech)-Protokoll spricht. Eine solche Route wird niemals als Chat-, Schnell-, Vision-, Sprach- oder Bildmodell angeboten; sie kann nur als Live-Voice-Modell über `experimental.liveVoice.model` ausgewählt werden (ein `modelId` oder `provider:modelId`, wenn dieselbe ID unter mehr als einem Anbieter existiert).

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.5-omni-plus-realtime",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "envKey": "DASHSCOPE_API_KEY",
        "realtimeOnly": true
      }
    ]
  },
  "experimental": {
    "liveVoice": {
      "enabled": true,
      "model": "qwen3.5-omni-plus-realtime",
      "voice": "Tina"
    }
  }
}
```

Wenn das ausgewählte Modell eine `realtimeOnly`-Route angibt, liest Live Voice den API-Schlüssel über das `envKey` der Route (zuerst Prozessumgebung, dann den `env`-Block von `settings.json`) und leitet den WebSocket-Endpunkt aus ihrem `baseUrl` ab (`https://<host>/compatible-mode/v1` wird zu `wss://<host>/api-ws/v1/realtime`). Die Route muss sowohl `baseUrl` als auch `envKey` deklarieren, und der Host muss ein DashScope-Endpunkt sein.

Zwei Regeln sind absichtlich:

- Workspace-Einstellungen werden niemals konsultiert, nur Benutzer- und Systemebene. Die `.qwen/settings.json` eines Projekts kann keine Live-Voice-Route hinzufügen oder umleiten.
- Ein **nacktes** `modelId`, das keiner `realtimeOnly`-Route entspricht, verwendet wie zuvor die freistehenden `experimental.liveVoice.endpoint`- und `experimental.liveVoice.apiKey`-Felder, sodass vorhandene Konfigurationen unverändert funktionieren. Ein `provider:modelId`-Selektor, dessen Anbieter existiert, aber keine solche Route hat, ist stattdessen ein Fehler: Eine gelöschte oder falsch geschriebene Route fällt nie stillschweigend auf einen gespeicherten Schlüssel zurück.
- Während eine Route ausgewählt ist, werden `experimental.liveVoice.apiKey` und `experimental.liveVoice.endpoint` nicht verwendet, und die Setup-API weigert sich, neue zu speichern.

Auf dem freistehenden Pfad setzen die Qwen Live-Einstellungen des Web Shell den Endpunkt und das Modell direkt. Geben Sie die OpenAI-kompatible Basis-URL der Region oder der dedizierten Domain ein, der Ihr Schlüssel gehört, wie z. B. `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`; wenn leer gelassen, verwendet Live Peking (`https://dashscope.aliyuncs.com/compatible-mode/v1`), und ein Schlüssel von anderswo wird mit `401` abgelehnt. Die Basis-URL wird wie eingegeben gespeichert und bei Beginn eines Aufrufs in `wss://<host>/api-ws/v1/realtime` konvertiert; der Host muss ein DashScope- oder `*.maas.aliyuncs.com`-Endpunkt sein. Während Live Voice aktiv ist, wird ein neuer Endpunkt vor dem Speichern mit einem Realtime-Handshake überprüft.

## Überschreiben der Reasoning-Fähigkeiten [#override-reasoning-capabilities]

Legen Sie `capabilities.reasoning` auf einem Modelleintrag fest, um dessen Reasoning-Format, angebotene Anstrengungsstufen und Standardwert zu überschreiben. Bekannte Modelle übernehmen fehlende Felder aus dem Anbieterkatalog am ausgewählten Endpunkt; zum Beispiel lässt `"capabilities": { "reasoning": { "defaultEffort": "medium" } }` eine DashScope-`qwen3.8-max`-Route medium verwenden, wenn keine explizite Anstrengung ausgewählt ist. Für einen unbekannten Alias erklären Sie alle drei Felder:

```json
{
  "id": "company-model-v2",
  "baseUrl": "https://gateway.example.com/v1",
  "envKey": "COMPANY_MODEL_API_KEY",
  "capabilities": {
    "reasoning": {
      "profile": "openai-effort",
      "efforts": ["low", "medium", "high"],
      "defaultEffort": "medium"
    }
  }
}
```

`efforts` ersetzt die unterstützte Teilmenge von `low/medium/high/xhigh/max`. Ein expliziter Standardwert muss zu dieser Teilmenge gehören. Profile verwenden vorhandene Formate: Chat akzeptiert `openai-effort`, `openai-reasoning`, `deepseek-openai`, `dashscope-effort`, `dashscope-thinking` und `qwen-chat-template`; Responses akzeptiert `openai-reasoning`; Anthropic akzeptiert `anthropic-manual`, `anthropic-adaptive` und `deepseek-anthropic`; Gemini/Vertex verwendet `gemini`. Die beiden Toggle-only-Profile lassen `efforts` und `defaultEffort` weg. Gemini verwendet low/medium/high. Ein adaptives Profil wählt adaptives Denken auch dann aus, wenn ein Legacy-manuelles Budget konfiguriert ist. Vorhandene vollständige Fähigkeitsdeklarationen funktionieren weiterhin.

Reasoning-Änderungen werden vor der nächsten Benutzereingabe angewendet. Deren Anfragen, Wiederholungen und Child-Agents teilen die erfasste Reasoning-Konfiguration. Ungültige Aktualisierungen behalten die vorherige Konfiguration bei und protokollieren den Modell-/Fehlerfeldfehler. Ungültige Deklarationen in neuen Sitzungen fallen sicher auf das bestehende Modellverhalten zurück. Explizite Benutzerentscheidungen und anbieter-native Überschreibungen in `reasoning`, `samplingParams` und `extra_body` behalten ihre bestehende Priorität bei; ein Modellstandardwert wird nicht als Benutzerentscheidung gespeichert. Dieser Mechanismus ändert nicht die Lebenszyklen von Endpunkten, Berechtigungen oder Bildmodellen.

## Konfigurationsbeispiele nach Authentifizierungstyp

Nachfolgend finden Sie umfassende Konfigurationsbeispiele für verschiedene Authentifizierungstypen, die die verfügbaren Parameter und deren Kombinationen zeigen.

### Unterstützte Authentifizierungstypen

Verwenden Sie eine der folgenden integrierten Provider-IDs oder ordnen Sie eine benutzerdefinierte ID mit `providerProtocol` zu:

| Effektives Protokoll | Beschreibung                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `openai`           | OpenAI-kompatible APIs. Standardmäßig Chat Completions; setzen Sie das `wireApi` eines Modells auf `responses` für die Responses API.                             |
| `anthropic`        | Anthropic Claude API                                                                                                                            |
| `gemini`           | Google Gemini API                                                                                                                               |
| `vertex-ai`        | Google Vertex AI (verwendet das `gemini`-Protokoll und das `@google/genai`-SDK im Vertex-AI-Modus; die Auswahl setzt `GOOGLE_GENAI_USE_VERTEXAI=true`) |

> [!note]
> Vertex-AI-Einträge können sich mit **Application Default Credentials** authentifizieren. Setze `GOOGLE_CLOUD_PROJECT` (und optional `GOOGLE_CLOUD_LOCATION`, was standardmäßig `global` ist) und lasse `envKey` unset, zusammen mit jeder anderen Key-Quelle, die der Resolver liest: `GOOGLE_API_KEY`, `settings.security.auth.apiKey` und die CLI-Key-Flags. Jeder API-Key-Wert, der einen Vertex-Eintrag erreicht, schaltet das Google SDK in den Vertex Express mode, der das Projekt, den Standort und deine ADC-Credentials ignoriert. Ein Eintrag, der einen `envKey` deklariert, wird niemals an ADC weitergeleitet, sodass ein Key, der nicht injiziert werden kann, auf dieser Variablen weiterhin fehlschlägt, anstatt sich stillschweigend als ein anderes Principal zu authentifizieren.

> [!warning]
> Eine Provider-ID, die weder ein integriertes Protokoll noch über `providerProtocol` zugeordnet ist (z. B. ein Tippfehler wie `"openai-custom"`), kann nicht geroutet werden, daher wird ihr gesamter Eintrag **übersprungen** mit einer Warnung – ihre Modelle erscheinen einfach nicht im `/model`-Auswahlmenü. Verwenden Sie einen der oben genannten unterstützten Authentifizierungstypwerte für integrierte Provider oder fügen Sie eine [`providerProtocol`](#custom-provider-ids-providerprotocol)-Zuordnung für eine benutzerdefinierte ID hinzu.

### Benutzerdefinierte Provider-IDs (`providerProtocol`) [#custom-provider-ids-providerprotocol]

Eingebaute Provider-IDs (`openai`, `gemini`, `anthropic`, `vertex-ai`, `qwen-oauth`) werden automatisch an ihr SDK-Protokoll geroutet. Um eine **benutzerdefinierte** Provider-ID zu verwenden — zum Beispiel um mehrere OpenAI-kompatible Endpunkte unter einem freundlicheren Namen zu gruppieren — deklariere sie unter `modelProviders` und ordne sie mit der Top-Level-Einstellung `providerProtocol` einem eingebauten Protokoll zu:

```json
{
  "modelProviders": {
    "idealab": [
      {
        "id": "my-model",
        "envKey": "IDEALAB_API_KEY",
        "baseUrl": "https://idealab.example.com/v1"
      }
    ]
  },
  "providerProtocol": {
    "idealab": "openai"
  }
}
```

Ohne einen passenden `providerProtocol`-Eintrag wird eine benutzerdefinierte Provider-ID übersprungen (siehe die Warnung oben).

### Auswählen der OpenAI API

Setzen Sie `wireApi` neben `id`, `envKey` und `baseUrl` bei einem OpenAI-kompatiblen Modell:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "my-model",
        "wireApi": "responses",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ]
  },
  "security": { "auth": { "selectedType": "openai" } },
  "model": { "name": "my-model" }
}
```

Die unterstützten Werte sind `chat-completions` und `responses`. Das Weglassen von `wireApi` verwendet Chat Completions für `openai`, einschließlich benutzerdefinierter Anbieter, die auf `openai` abgebildet sind. Andere Werte oder `wireApi` bei einem Anthropic-, Gemini-, Vertex AI- oder Qwen OAuth-Modell sind Konfigurationsfehler.

Verwenden Sie `openai` mit modellbezogenen `wireApi` für neue Konfigurationen. Das Format `modelProviders.openai-responses` und die Abbildungen von `providerProtocol` auf `openai-responses` aus v0.23.3 bleiben lesbar. Explizite Anbieterabbildungen haben Vorrang vor Bucket-Namen; explizites `wireApi` hat Vorrang vor beiden OpenAI-Protokollen. Das Laden überschreibt keine Einstellungen oder ändert keine Referenzen auf Zugangsdaten. Die Neukonfiguration schreibt die ausgewählten Routen im neuen Format und entfernt nur deren passende alte Einträge im beschreibbaren Bereich; Einträge unter einer Anbieter-ID, die einen Punkt enthält, bleiben erhalten, und unrelated Modelle, Endpunkte, APIs und Bereiche bleiben unverändert. `api` ist kein Alias für `wireApi`.

`wireApi` ist lokale Routing-Metadaten; es gehört nicht in `generationConfig` oder `extra_body` und wird nicht im Anfragekörper gesendet. Eine neue benutzerdefinierte Einrichtung teilt einen Zugangsdatenslot für denselben OpenAI-Endpunkt über beide APIs hinweg, sodass das Rotieren dieses Schlüssels beide Routen aktualisiert. Manuell konfigurierte Modelle können unterschiedliche explizite `envKey`-Referenzen verwenden, wenn unabhängige Zugangsdaten erforderlich sind. Wählen Sie in `/auth` → Benutzerdefinierter Anbieter OpenAI-kompatibel und dann das API-Format aus.

Beim Start kann `selectedType: "openai"` ein Modell auflösen, das explizit mit `wireApi: "responses"` konfiguriert wurde, wenn am ausgewählten konfigurierten Endpunkt keine passende Chat-Route vorhanden ist. Die Modellauswahl und aufgezeichnete Sitzungen behalten das effektive Protokoll (`openai` oder `openai-responses`) bei, sodass beide Routen unabhängig ausgewählt und fortgesetzt werden können. Bei einem fehlgeschlagenen API-Anfrage erfolgt keine Endpunkterkennung oder automatischer Fallback.

### Transporte für API-Anfragen

Das effektive Modellprotokoll bestimmt den Transport. Beide OpenAI-APIs verwenden die Anbietergruppe `openai`; `wireApi` wählt Chat Completions oder Responses:

| Effektives Protokoll | Transport                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `openai`           | [`openai`](https://www.npmjs.com/package/openai) - Offizielles OpenAI Node.js SDK                                     |
| `openai-responses` | Direkte HTTP/SSE-Aufrufe an `/v1/responses` (kein SDK); Embeddings verwenden [`openai`](https://www.npmjs.com/package/openai) |
| `anthropic`        | [`@anthropic-ai/sdk`](https://www.npmjs.com/package/@anthropic-ai/sdk) - Offizielles Anthropic SDK                    |
| `gemini`           | [`@google/genai`](https://www.npmjs.com/package/@google/genai) - Offizielles Google GenAI SDK                         |
| `qwen-oauth`       | [`openai`](https://www.npmjs.com/package/openai) mit benutzerdefiniertem Anbieter (DashScope-kompatibel)                       |

Dies bedeutet, dass das von Ihnen konfigurierte `baseUrl` mit dem erwarteten API-Format des entsprechenden Transports kompatibel sein sollte. Beispielsweise erfordert `wireApi: "responses"` einen Responses-kompatiblen Endpunkt.

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
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "maxRetries": 3,
          "retryInitialDelayMs": 3000,
          "retryMaxDelayMs": 30000,
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
```

Wenn Sie einen Eintrag auf ein gehostetes OpenAI-kompatibles Gateway richten, setzen Sie `baseUrl` auf den `/v1`-Stamm der API (zum Beispiel `https://gateway.example.com/v1`) statt auf den vollständigen `/v1/chat/completions`-Pfad — das SDK fügt den Anfrageweg selbst hinzu.

### OpenAI Responses API (`openai-responses`)

Verwenden Sie `openai` mit `wireApi: "responses"`, um den `/v1/responses`-Endpunkt von OpenAI anzusteuern. Wenn der Endpunkt verschlüsseltes Reasoning mit sichtbarem Gedankentext zurückgibt, wiederholt er das Reasoning früherer Runden über mehrere Runden hinweg und `--resume` über `reasoning.encrypted_content`. Kompatible Endpunkte, die `response.reasoning_text.delta` streamen, zeigen ihr Reasoning ebenfalls an, aber Endpunkte ohne `encrypted_content` können den opaken Reasoning-Zustand nicht wiederholen. Verwenden Sie `reasoning.effort` (nicht `extra_body.enable_thinking`, das von den Chat Completions-Leitungen verwendet wird), um die Intensität des Reasonings zu steuern.

```json
{
  "env": {
    "OPENAI_API_KEY": "sk-your-actual-openai-key-here"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-5.1",
        "wireApi": "responses",
        "name": "GPT-5.1 (Responses API)",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1",
        "generationConfig": {
          "timeout": 60000,
          "reasoning": {
            "effort": "high"
          },
          "samplingParams": {
            "temperature": 0.7,
            "max_tokens": 4096
          }
        }
      }
    ]
  }
}
```

> [!note]
> `extra_body` auf dieser Leitung ist nur zum Auffüllen: Ein Schlüssel wird nur dann in den Anfragekörper geschrieben, wenn die generierte Anfrage keinen Wert dafür hat, sodass er kein Feld überschreiben kann, das die Pipeline bereits gesetzt hat (`model`, `input`, `reasoning`, `temperature`, `max_output_tokens`, ...). Der Legacy-Schlüssel `enable_thinking` ist die einzige Ausnahme davon — er wird entfernt statt weitergeleitet (es ist kein Responses-API-Feld) und in `reasoning.effort: "medium"` übersetzt, wenn kein explizites `reasoning` gesetzt ist. Setzen Sie `reasoning.effort` direkt statt `extra_body.enable_thinking` für diesen Anbieter.

### Anthropic (`anthropic`)

Claude Opus 5.5, Sonnet 5.5, Fable 5.1 und Mythos 5.1 lehnen erzwungene Tool-Auswahl ab. Für strukturierte Nebenabfragen verwendet Qwen Code automatische Tool-Auswahl mit einer expliziten Schema-Antwort-Anweisung auf diesen Modellen. Modelle, die erzwungene Auswahl unterstützen, behalten diese bei. Automatische Auswahl garantiert keinen Tool-Aufruf; JSON-Nebenabfragen können auch ein rohes JSON-Objekt aus dem Antworttext lesen, ohne Markdown-Zäune oder umgebende Prosa. Siehe [Anthropics Tool-Choice-Einschränkungen](https://platform.claude.com/docs/en/agents-and-tools/tool-use/define-tools#forcing-tool-use).

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

Für ein Vision-Modell, das auch der normalen Qwen Code-Agent-Richtlinie folgen und Tools verwenden kann, opt-in zum Full-Turn-Image-Routing mit beiden Fähigkeiten:

```json
"capabilities": {
  "vision": true,
  "agent": true
}
```

Wenn ein reines Textmodell dieses Modell als seinen konfigurierten Vision-Fallback verwendet, bleibt der vollständige bildtragende Turn bei Tool-Aufrufen und Retries auf genau diesem Provider, Modell und Endpunkt. Der nächste unabhängige Turn kehrt zum primären Modell zurück, und jede Modell-Anfrage erhält nur die von ihrem Ziel unterstützten Medien-Modalitäten. Lasse `agent` weg (oder setze es auf `false`), um den sichereren Vision-Bridge-Transkriptionsfluss beizubehalten.

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
    "openai": [
      {
        "id": "qwen2.5-7b",
        "name": "Qwen2.5 7B (Ollama)",
        "envKey": "OLLAMA_API_KEY",
        "baseUrl": "http://localhost:11434/v1",
        "generationConfig": {
          "timeout": 300000,
          "streamIdleTimeoutMs": 600000,
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

Für Warteschlangen- oder langsame lokale OpenAI-kompatible Server steuert `streamIdleTimeoutMs`, wie lange dieses Modell zwischen gestreamten Chunks stumm bleiben darf. Es überschreibt den globalen `QWEN_STREAM_IDLE_TIMEOUT_MS`-Wert für den ausgewählten Anbiettereintrag; setzen Sie es auf `0`, um den Idle-Guard zu deaktivieren. Die separate 15-minütige Stream-Lebensdauer-Obergrenze gilt weiterhin, es sei denn, `QWEN_STREAM_MAX_LIFETIME_MS` wird erhöht oder deaktiviert.

Für lokale Server, die keine Authentifizierung erfordern, können Sie einen beliebigen Platzhalterwert für den API-Schlüssel verwenden:

```bash
# For Ollama (no auth required)
export OLLAMA_API_KEY="ollama"

# For vLLM (if no auth is configured)
export VLLM_API_KEY="not-needed"
```

> [!note]
>
> Der Parameter `extra_body` wird **nur für OpenAI-kompatible Provider unterstützt** (`openai`, `qwen-oauth`). Er wird für Anthropic- und Gemini-Provider ignoriert. Bei `openai-responses` wird der Schlüssel `enable_thinking` übersetzt statt weitergeleitet — siehe die Notiz zur [OpenAI Responses API](#openai-responses-api-openai-responses).

> [!note]
>
> **Über `envKey`**: Das `envKey`-Feld gibt den **Namen einer Umgebungsvariable** an, nicht den tatsächlichen API-Key-Wert. Damit die Konfiguration funktioniert, musst du sicherstellen, dass die entsprechende Umgebungsvariable mit deinem echten API-Key gesetzt ist. Es gibt zwei Möglichkeiten, dies zu tun:
>
> - **Option 1: Verwendung einer `.env`-Datei** (aus Sicherheitsgründen empfohlen):
>   ```bash
>   # ~/.qwen/.env (or project root)
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

#### Qwen3.x unter einem benutzerdefinierten Modellnamen bereitgestellt

Die Steuerung des Denkens und das Kontextfenster werden aus der Modell-ID abgeleitet. Wenn ein vLLM- oder SGLang-Server ein Qwen3.x-Modell unter einer ID bereitstellt, die nicht mit `qwen` beginnt (zum Beispiel `--served-model-name chat`), greift keine dieser Regeln: Nebenläufige Anfragen wie der Berechtigungs-Klassifikator im Auto-Modus behalten das Denken aktiviert, und das Kontextfenster fällt auf den Standardwert von 200K zurück. Deklarieren Sie beide Werte im Modelleintrag, wie in [Override reasoning capabilities](#override-reasoning-capabilities) beschrieben:

```json
{
  "id": "chat",
  "name": "Qwen3.6 35B A3B (vLLM)",
  "envKey": "VLLM_API_KEY",
  "baseUrl": "http://localhost:8000/v1",
  "capabilities": { "reasoning": { "profile": "qwen-chat-template" } },
  "generationConfig": { "contextWindowSize": 262144 }
}
```

`qwen-chat-template` sendet `chat_template_kwargs.enable_thinking`, was diese Server an die Qwen-Chat-Vorlage übergeben; ein Feld `enable_thinking` auf oberster Ebene wird von ihnen nicht gelesen. Setzen Sie `contextWindowSize` auf die maximale Modell-Länge des Servers (vLLM meldet dies als `max_model_len` in `/v1/models`). Qwen Code sendet Tool-Definitionen bei jeder Anfrage, daher muss der Server auch Tool Calling und einen Reasoning-Parser aktivieren; bei vLLM sind dies `--enable-auto-tool-choice`, ein `--tool-call-parser` für das Modell (zum Beispiel `qwen3_xml`) und `--reasoning-parser qwen3`. Die Namen der Parser ändern sich zwischen Server-Releases, daher prüfen Sie die Dokumentation Ihres Servers.

## Alibaba Cloud Coding Plan bietet eine vorab konfigurierte Reihe von Qwen-Modellen, die für Codierungsaufgaben optimiert sind. Diese Funktion ist für Nutzer mit Alibaba Cloud Coding Plan API-Zugang verfügbar und bietet eine vereinfachte Einrichtungserfahrung mit automatischen Modell-Konfigurationsupdates.

Alibaba Cloud Coding Plan bietet eine vorconfigurierte Reihe von Qwen-Modellen, die für Codierungsaufgaben optimiert sind. Diese Funktion ist für Benutzer mit Alibaba Cloud Coding Plan API-Zugang verfügbar und bietet eine vereinfachte Setup-Erfahrung mit automatischen Modellkonfigurations-Updates.

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
   - **International**: <https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan>
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

Die Region wird während der Authentifizierung ausgewählt und in `settings.json` unter der `modelProviders` Konfiguration gespeichert. Um die Regionen zu wechseln, führen Sie den Befehl `/auth` erneut aus und wählen Sie eine andere Region.

### API-Key-Speicherung

Wenn du den Coding Plan über den Befehl `/auth` konfigurierst, wird der API-Key unter Verwendung des reservierten Umgebungsvariablennamens `BAILIAN_CODING_PLAN_API_KEY` gespeichert. Standardmäßig wird er im `env`-Feld deiner `settings.json`-Datei gespeichert.

> [!warning]
>
> **Sicherheitsempfehlung**: Für eine bessere Sicherheit wird empfohlen, den API-Key aus der `settings.json` in eine separate `.env`-Datei zu verschieben und ihn als Umgebungsvariable zu laden. Beispiel:
>
> ```bash
> # ~/.qwen/.env
> BAILIAN_CODING_PLAN_API_KEY=your-api-key-here
> ```
>
> Stelle anschließend sicher, dass diese Datei zu deiner `.gitignore` hinzugefügt wird, wenn du Einstellungen auf Projektebene verwendest.

### Automatische Updates

Die Modellkonfigurationen des Coding Plans sind versioniert. Wenn Qwen Code eine neuere Version der Modellvorlage erkennt, wirst du zu einem Update aufgefordert. Wenn du das Update akzeptierst, wird Folgendes durchgeführt:

- Die bestehenden Coding-Plan-Modellkonfigurationen werden durch die neuesten Versionen ersetzt
- Alle benutzerdefinierten Modellkonfigurationen, die du manuell hinzugefügt hast, bleiben erhalten
- Lassen Sie Ihr ausgewähltes Modell unverändert; wenn es in der aktualisierten Konfiguration nicht mehr vorhanden ist, verwenden Sie `/model`, um ein neues auszuwählen

Der Aktualisierungsprozess erneuert die Modellkonfigurationen und Funktionen, ohne Ihr ausgewähltes Modell zu ändern.

### Manuelle Konfiguration (Fortgeschritten)

Wenn du Coding-Plan-Modelle lieber manuell konfigurieren möchtest, kannst du sie wie jeden OpenAI-kompatiblen Provider zu deiner `settings.json` hinzufügen:

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
> Bei manueller Konfiguration:
>
> - Du kannst einen beliebigen Umgebungsvariablennamen für `envKey` verwenden
> - Du musst `codingPlan.*` nicht konfigurieren
> - **Automatische Updates gelten nicht** für manuell konfigurierte Coding-Plan-Modelle

> [!warning]
>
> Wenn du auch die automatische Coding-Plan-Konfiguration verwendest, können automatische Updates deine manuellen Konfigurationen überschreiben, wenn sie denselben `envKey` und dieselbe `baseUrl` wie die automatische Konfiguration verwenden. Um dies zu vermeiden, stelle sicher, dass deine manuelle Konfiguration nach Möglichkeit einen anderen `envKey` verwendet.

## Auflösungsebenen und Atomarität

Die effektiven Auth-/Modell-/Credential-Werte werden feldweise anhand der folgenden Priorität ausgewählt (der zuerst vorhandene Wert gewinnt). Du kannst `--auth-type` mit `--model` kombinieren, um direkt auf einen Provider-Eintrag zu verweisen; diese CLI-Flags werden vor anderen Ebenen ausgeführt.

| Ebene (höchste → niedrigste) | authType                            | Modell                                          | apiKey                                            | baseUrl                                            | apiKeyEnvKey           | proxy                             |
| -------------------------- | ----------------------------------- | ----------------------------------------------- | ------------------------------------------------- | -------------------------------------------------- | ---------------------- | --------------------------------- |
| Programmatische Overrides  | `/auth`                             | `/auth`-Eingabe                                 | `/auth`-Eingabe                                   | `/auth`-Eingabe                                    | —                      | —                                 |
| Modellauswahl              | —                                   | `modelProvider.id`                              | `env[modelProvider.envKey]`                       | `modelProvider.baseUrl`                            | `modelProvider.envKey` | —                                 |
| CLI-Argumente              | `--auth-type`                       | `--model`                                       | `--openai-api-key`                                | `--openai-base-url`                                | —                      | —                                 |
| Umgebungsvariablen         | —                                   | Provider-spezifisches Mapping (z. B. `OPENAI_MODEL`) | Provider-spezifisches Mapping (z. B. `OPENAI_API_KEY`) | Provider-spezifisches Mapping (z. B. `OPENAI_BASE_URL`) | —                      | —                                 |
| Einstellungen (`settings.json`) | `security.auth.selectedType`        | `model.name`                                    | `security.auth.apiKey`                            | `security.auth.baseUrl`                            | —                      | —                                 |
| Standard / berechnet       | Fällt auf `AuthType.QWEN_OAUTH` zurück | Eingebauter Standard (OpenAI ⇒ `qwen3.5-plus`) | —                                                 | —                                                  | —                      | `Config.getProxy()`, falls konfiguriert |

\*Wenn vorhanden, überschreiben CLI-Auth-Flags die Einstellungen. Andernfalls bestimmen `security.auth.selectedType` oder der implizite Standard den Auth-Typ. Siehe [Authentifizierung](./auth.md) für Anmeldeoptionen. Der Legacy-freie Qwen OAuth Provider ist getrennt vom [Qwen Account mit Abonnement](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).

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

   Wenn ein Modell in `modelProviders` aufgeführt ist, legen Sie alle modellspezifischen Generierungseinstellungen für dieses Modell im entsprechenden Provider-Eintrag fest. Werte auf oberster Ebene in `model.generationConfig`, einschließlich `contextWindowSize`, `modalities`, `customHeaders` und `extra_body`, werden für Provider-Modelle ignoriert. Konfigurieren Sie diese Felder unter `modelProviders[authType][].generationConfig`, damit sie wirksam werden.

2. **Wenn KEIN modelProvider-Modell ausgewählt ist** (z. B. bei Verwendung von `--model` mit einer rohen Modell-ID oder bei direkter Verwendung von CLI/env/settings):
   - Die Auflösung fällt auf tiefere Ebenen zurück
   - Felder werden aus CLI → env → settings → Defaults befüllt
   - Dies erzeugt ein **Runtime Model** (siehe nächster Abschnitt)

### Feldweise Priorität für `generationConfig`

| Priorität | Quelle                                        | Verhalten                                                                                                 |
| -------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1        | Programmatische Overrides                     | Runtime-Änderungen über `/model`, `/auth`                                                                |
| 2        | `modelProviders[authType][].generationConfig` | **Undurchdringliche Ebene** – ersetzt alle generationConfig-Felder vollständig; tiefere Ebenen nehmen nicht teil |
| 3        | `settings.model.generationConfig`             | Wird nur für **Runtime Models** verwendet (wenn kein Provider-Modell ausgewählt ist)                     |
| 4        | Content-Generator-Defaults                    | Provider-spezifische Defaults (z. B. OpenAI vs. Gemini) – nur für Runtime Models                         |

### Dynamische Werte in `customHeaders` [#dynamic-values-in-customheaders]

Ein Wert in `customHeaders` kann den Platzhalter `${session_id}` enthalten, der pro Anfrage mit der aktuellen Qwen Code-Sitzungs-ID expandiert wird. Verwenden Sie ihn für Gateways, die eine stabile Identifikation pro Konversation erfordern – OpenCode Go lehnt beispielsweise Anfragen ohne `x-opencode-session` ab:

```json
{
  "generationConfig": {
    "customHeaders": {
      "x-opencode-session": "${session_id}"
    }
  }
}
```

Da der Wert pro Anfrage aufgelöst wird und nicht in den SDK-Client eingebettet ist, rotieren `/new` und `/resume` ihn ohne Neustart.

⚠️ **Zwei Schritte sind erforderlich.** Der obige Provider-Eintrag ist nur die halbe Miete – ein Platzhalter ist wirkungslos, bis Sie zusätzlich [`outboundCorrelation.allowDynamicHeaderValues`](./settings.md#outboundcorrelation) aktivieren:

```json
{
  "outboundCorrelation": {
    "allowDynamicHeaderValues": true
  }
}
```

Bis dahin wird ein Wert, der einen Platzhalter enthält, **verworfen** statt gesendet, und Qwen Code gibt beim Start eine Warnung aus, die den Header und diese Einstellung nennt. Der Header wird niemals mit einem literalen `${session_id}` darin gesendet.

**Ein Header ist reserviert.** Auf den QwenCloud-MaaS-Endpunkten – den Einträgen `China — Qianwen AI Platform` und `International — QwenCloud` in `/auth` – besitzt Qwen Code `X-DashScope-Source-Config` und schreibt den Attributionswert des Erstparteianbieters hinein. Ein Eintrag unter diesem Namen – in beliebiger Schreibweise – wird entfernt, bevor die Anfrage erstellt wird, sodass ein Platzhalter `${session_id}` darin nie überlebt und `allowDynamicHeaderValues` daran nichts ändert. Der Header selbst wird weiterhin gesendet; nur Ihr Wert wird ersetzt. Siehe [`customHeaders`](./settings.md#model) für dieselbe Regel, formuliert aus Sicht der Einstellungen.

Der Schalter ist global, da es sich um eine Zustimmungsentscheidung handelt, unabhängig davon, _wohin_ der Wert geht: Ein expandierter Wert trägt lebendigen Sitzungsstatus an jeden Empfänger weiter, und der Schalter steuert nur, ob `${session_id}` expandiert werden darf. Er identifiziert nicht, welche Einstellungsquelle den Header geliefert hat.

**Hinweis zum Datenschutz:** Die Sitzungs-ID ist ein stabiler Identifier für die Lebensdauer einer Konversation, sodass jeder Host, an den Sie sie senden, jede Anfrage dieser Konversation gruppieren kann. Welche Hosts dies sind, wird dadurch bestimmt, welche Provider-Einträge den Header tragen – es gibt keine separate Hostliste, die mit Ihrem `baseUrl` synchron gehalten werden muss.

### Behandlung atomarer Felder

Die folgenden Felder werden als atomare Objekte behandelt – Provider-Werte ersetzen das gesamte Objekt vollständig, es findet kein Merging statt:

- `samplingParams` – Temperature, top_p, max_tokens usw.
- `customHeaders` - Benutzerdefinierte HTTP-Header (können `${session_id}` enthalten; siehe [Dynamische Werte](#dynamic-values-in-customheaders))
- `extra_body` – Zusätzliche Request-Body-Parameter

### Beispiel

```jsonc
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

Bei Verwendung eines Rohmodells über `--model gpt-4` (nicht aus modelProviders, erstellt ein Runtime Model):

- `timeout` = 30000 (aus den Einstellungen)
- `samplingParams.temperature` = 0.5 (aus den Einstellungen)
- `samplingParams.max_tokens` = 1000 (aus den Einstellungen)

Die Merge-Strategie für `modelProviders` selbst ist REPLACE: Das gesamte `modelProviders` aus den Projekt-Einstellungen überschreibt den entsprechenden Abschnitt in den Benutzer-Einstellungen, anstatt die beiden zusammenzuführen.

## Reasoning / Thinking-Konfiguration

Das optionale Feld `reasoning` unter `generationConfig` steuert, wie intensiv das Modell vor der Antwort reasoning betreibt. Die Anthropic- und Gemini-Konverter berücksichtigen es immer. Die OpenAI-kompatible Pipeline berücksichtigt es **außer**, wenn `generationConfig.samplingParams` gesetzt ist. Bekannte GPT-5-Modelle und GPT-6 Astra sind eine Ausnahme: Unverwandte Sampling-Schlüssel unterdrücken den konfigurierten Aufwand nicht. Siehe "Interaktion mit `samplingParams`" unten.

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
          // The effort tiers:
          //   'low'    — lightest reasoning
          //   'medium' | 'xhigh' — mapped to 'high' on DeepSeek
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

### Verhalten pro Provider

| Protokoll / Anbieter                           | Datenformat                                                                              | Hinweise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenAI / DashScope** (`qwen3.8-max`-Familie) | Flacher `reasoning_effort: <effort>`-Body-Parameter                                         | Die `/effort`-Stufen werden für jede Modell-ID durchgereicht, die mit `qwen3.8-max` beginnt (einschließlich datierter Snapshots und `-latest`-Aliase), die nur auf Einladung verfügbaren `qwen-latest-series-invite-*`-Vorschauen und die `qwen4*`-Familie (alle Groß-/Kleinschreibung ignorierend); DashScope wendet modell-spezifische Zuordnungen an. Diese Familien-Leiter endet bei `xhigh`, daher wird ein konfiguriertes `max` auf `xhigh` begrenzt (einmalig protokolliert), statt gesendet und abgelehnt zu werden. Ein explizites `reasoning_effort` in `samplingParams` oder `extra_body` ist eine wörtliche Überschreibung und wird nicht begrenzt. Wenn `reasoning_effort` und `thinking_budget` im Konflikt stehen, behält die normale `extra_body` > `samplingParams` > `reasoning`-Priorität nur das Feld mit höherer Priorität; ein explizites Paar auf derselben Ebene behält `reasoning_effort`, was dem Verhalten des Anbieters vor der auflagenübergreifenden Auflösung entspricht. Wenn ein statisches Feld gewinnt, meldet `/effort` dieses Feld, statt anzudeuten, dass die angeforderte Stufe wirksam ist. Wenn eine Effort-Stufe gewinnt, wird ein widersprüchliches `enable_thinking` ebenfalls verworfen. Ein explizites `enable_thinking: false` in `extra_body` wird respektiert statt verworfen: Es überschreibt die konfigurierte Stufe als `reasoning_effort: 'none'`, einer der wenigen Orte, an denen `extra_body` nicht wörtlich gewinnt. Andere Qwen-Modelle bilden weiterhin einen ausgewählten Effort auf `enable_thinking: true` ab; eine `reasoning_effort`-Überschreibung wird dort durchgereicht, es sei denn, sie steht im Konflikt mit einem `thinking_budget` (ein Paar, das DashScope ablehnt), wobei dann das inaktive `reasoning_effort` verworfen wird und sowohl `enable_thinking` als auch `thinking_budget` bestehen bleiben. |
| **OpenAI / DeepSeek** (`api.deepseek.com`)    | Flacher `reasoning_effort: <effort>`-Body-Parameter                                         | Wenn `reasoning.effort` im verschachtelten Konfigurationsformat gesetzt ist, wird es in flaches `reasoning_effort` umgeschrieben; für die integrierten DeepSeek-Modelle werden `'low'`, `'high'` und `'max'` durchgereicht und `'medium'`/`'xhigh'` auf `'high'` normalisiert — spiegelt DeepSeeks [Effort-Zuordnung](https://api-docs.deepseek.com/guides/thinking_mode) wider. Diese Durchreichung und Normalisierung beschreiben den offiziellen Endpunkt: Auf MaaS und Drittanbieter-Hosts bieten die genauen `deepseek-v4-pro` / `deepseek-v4-flash`-IDs nur `high`/`max` an (ein konfiguriertes `low` wird auf `high` angehoben, und `xhigh` normalisiert sich auf `max`), während die neueren Flash-Aliase (`deepseek-v4.1-flash*`) `low`/`high`/`max` mit `xhigh → high` beibehalten. Top-Level-`samplingParams.reasoning_effort`- oder `extra_body.reasoning_effort`-Überschreibungen überspringen diese Normalisierung und werden wörtlich versandt. `max` wird auf einem echten DeepSeek-Hostname und bei jeder `deepseek-v4*`-Modell-ID akzeptiert (Groß-/Kleinschreibung ignorierend, datierte Snapshots eingeschlossen), was auf jedem OpenAI-kompatiblen Host erkannt wird (Drittanbieter-Gateways erhalten den MaaS-artigen `enable_thinking`-Vertrag); andere `deepseek`-benannte Modelle auf einem anderen Host behalten die generische `xhigh`-Obergrenze, passend zur Hostname-Prüfung beim Reshape selbst.                                                                                                                                                                                                                                                                                                                                           |
| **OpenAI / Z.ai** (`z.ai`, `bigmodel.cn`)     | Flacher `reasoning_effort: <effort>`-Body-Parameter                                         | GLM-5.2+ auf einem Z.ai-Host nimmt die volle Leiter, einschließlich `max`, und das verschachtelte `reasoning.effort` wird in das flache Feld umgeschrieben. Ältere GLM-IDs und ein `glm-*`-Modell, das auf einem anderen Host erreicht wird, behalten die generische `xhigh`-Obergrenze: Der Modellname allein sagt nichts darüber aus, was dieser Endpunkt akzeptiert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **OpenAI** (andere kompatible Server)         | Bekannte GPT-5 / GPT-6 Astra: flach `reasoning_effort`; andere Modelle: verschachtelt `reasoning`     | Der GPT-Aufwand wird in beide Richtungen auf die unterstützte Teilmenge für das bekannte Modell begrenzt. GPT-5.6 und GPT-6 Astra erlauben `max`, während frühere Modelle niedrigere Obergrenzen haben. Stufen unterhalb des Modell-Minimums werden angehoben: GPT-5 Pro akzeptiert nur `high`; GPT-5.2 Pro, GPT-5.4 Pro und GPT-5.5 Pro heben `low` auf `medium` an. OpenRouter behält die verschachtelte Form `reasoning` bei. Unbekannte Modellnamen behalten die generische Obergrenze `xhigh` und die verschachtelte Struktur bei. Explizite Reasoning-Werte in `samplingParams` / `extra_body` umgehen die Begrenzung der konfigurierten Stufe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **OpenAI Responses** (`openai-responses`)     | `reasoning: { effort, summary: "auto" }` plus `include: ["reasoning.encrypted_content"]` | Jede Stufe wird unverändert durchgereicht, ohne Begrenzung. `extra_body.enable_thinking: true` wird zu `reasoning: { effort: "medium" }` übersetzt, wenn kein expliziter Wert für `reasoning` gesetzt ist (und wird selbst nie weitergeleitet – es hat keine Bedeutung auf dieser Leitung); bevorzugen Sie die direkte Festlegung von `reasoning.effort`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Anthropic** (echtes `api.anthropic.com`)      | `output_config: { effort }` plus der `effort-2025-11-24` Beta-Header                     | Echtes Anthropic akzeptiert nur `'low'`/`'medium'`/`'high'`. `'max'` wird **auf `'high'` begrenzt**, mit einer `debugLogger.warn`-Zeile (einmal pro Generator); wenn Sie maximalen Aufwand wünschen, wechseln Sie die baseURL zu einem DeepSeek-kompatiblen Endpunkt, der dies unterstützt.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| **Anthropic** (`api.deepseek.com/anthropic`)  | Gleiches `output_config: { effort }` + Beta-Header                                           | `'low'`, `'high'` und `'max'` werden unverändert durchgereicht; `'medium'`/`'xhigh'` werden auf `'high'` abgebildet, was der serverseitigen Zuordnung von DeepSeek entspricht.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Gemini** (`@google/genai`)                  | `thinkingConfig: { includeThoughts: true, thinkingLevel }`                               | `'low'` → `LOW`, `'high'`/`'max'` → `HIGH`, andere → `THINKING_LEVEL_UNSPECIFIED` (Gemini hat keine `MAX`-Stufe).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

### `reasoning: false`

Das explizite Setzen von `reasoning: false` (dem literalen Boolean) deaktiviert das Denken bei Modellen, die dies unterstützen – nützlich für kostengünstige Nebenabfragen, die vom Reasoning nicht profitieren. Dies wird auch auf Anfrageebene über `request.config.thinkingConfig.includeThoughts: false` für einmalige Aufrufe (z. B. Generierung von Vorschlägen) berücksichtigt.

Bei einer `api.deepseek.com` baseURL sendet die OpenAI-Pipeline das explizite Feld `thinking: { type: 'disabled' }`, das DeepSeek V4+ erfordert – der serverseitige Standard ist `'enabled'`, sodass das bloße Weglassen von `reasoning_effort` weiterhin Latenz/Kosten für das Denken verursachen würde. Selbst gehostete DeepSeek-Backends (sglang/vllm) und andere OpenAI-kompatible Server erhalten dieses Feld **nicht**; wenn Sie das Denken dort deaktivieren müssen, injizieren Sie `thinking: { type: 'disabled' }` (oder den Regler, den Ihr Inferenz-Framework bereitstellt) über `samplingParams`/`extra_body`. Jede Modell-ID mit `deepseek-v4*` (Groß-/Kleinschreibung egal) ist eine Ausnahme: Auf jedem Drittanbieter-OpenAI-kompatiblen Host folgt sie dem MaaS-Vertrag und erhält `enable_thinking: false`, wenn das Denken deaktiviert ist. Auf jeder neu erkannten Route (ein Drittanbieter-Host oder ein neuer Alias auf einem bestehenden Host) behält eine Legacy-Deklaration `capabilities.reasoning` ohne Reasoning-Profil ihre eigenen Wire-Semantiken bei: Der eingebaute Normalisator greift nicht ein und weder die deklarierte noch die statische Anstrengung wird geglättet oder neu gestuft. Eine Deklaration muss den Regler benennen, den das Modell in `disableField` liest (`thinking`, `enable_thinking` oder `reasoning_effort`); eine, die ihn auslässt, löst keinerlei Fähigkeit auf, sodass kein Deaktivierungsfeld gesendet wird und der Serverstandard (Denken an) gilt.

Für bekannte GPT-Modelle, die das Deaktivieren erlauben, erhalten Nicht-OpenRouter-Endpunkte `reasoning_effort: 'none'`; OpenRouter erhält stattdessen ein verschachteltes `reasoning: { enabled: false }`. Modelle mit verpflichtendem Denken lehnen „off“ in den Modellsteuerungen ab und lassen nicht unterstützte Deaktivierungswerte aus Anfragen weg, sodass `reasoning: false` ihr Denken nicht deaktivieren kann. Eine explizite Modell-Reasoning-Fähigkeit hat Vorrang vor der integrierten Stufenliste und wählt das native Deaktivierungsfeld aus; OpenRouter behält sein anbieterseitiges Deaktivierungsverhalten bei. Die integrierte Menge für verpflichtendes Denken ist `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5-pro`, `gpt-5.1-codex`, `gpt-5.1-codex-max`, `gpt-5.2-codex`, `gpt-5.3-codex`, `gpt-5.2-pro`, `gpt-5.4-pro`, `gpt-5.5-pro` und `gpt-6-astra`.

Auf einer `openrouter.ai` baseURL sendet die OpenAI-Pipeline das anbieterseitige Feld `reasoning: { enabled: false }` von OpenRouter, wenn Reasoning deaktiviert ist. Modelle mit verpflichtendem Denken erhalten dieses Deaktivierungsfeld nicht. Andere OpenAI-kompatible Server erhalten dieses OpenRouter-spezifische Feld nicht automatisch; verwenden Sie deren natives Deaktivierungselement.

### Interaktion mit `samplingParams` (nur OpenAI-kompatibel)

> [!warning]
>
> Außer bei bekannten GPT-Modellen und Modellen mit expliziten Reasoning-Fähigkeiten: Wenn `generationConfig.samplingParams` auf einem OpenAI-kompatiblen Anbieter gesetzt ist, sendet die Pipeline diese Schlüssel **wörtlich** über das Netzwerk und überspringt die separate Injektion von `reasoning` vollständig. Eine Konfiguration wie `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` entfernt daher stillschweigend das Reasoning-Feld bei OpenAI/DeepSeek-Anfragen. Ein `reasoning`-Objekt innerhalb von `samplingParams` ist Ihr eigener Wert und wird unverändert gesendet, solange Reasoning aktiviert ist: Die oben genannte Obergrenze für den Aufwand gilt nur für die Stufe, die die Pipeline aus `/effort` injiziert.
>
> Bekannte GPT-5-Modelle und GPT-6 Astra behalten den konfigurierten Aufwand neben unrelated Sampling-Schlüsseln bei. Zum Beispiel sendet `{ samplingParams: { temperature: 0.5 }, reasoning: { effort: 'max' } }` `temperature: 0.5` und flaches `reasoning_effort: 'xhigh'` bei GPT-5.4 oder `'max'` bei GPT-5.6 / GPT-6 Astra. Auf einer `openrouter.ai` baseURL wird dieselbe begrenzte Stufe als verschachteltes `reasoning: { effort }` gesendet. Auf Nicht-OpenRouter-Endpunkten haben explizite flache Reasoning-Überschreibungen Vorrang; nullartige oder leere Zeichenketten-Platzhalter im flachen Format erlauben die konfigurierte Stufe. Bei OpenRouter unterdrückt eine flache Sampling-Überschreibung den konfigurierten verschachtelten Aufwand, es sei denn, explizite Modellfähigkeiten injizieren ihn; eine reine extra-body-flache Überschreibung ersetzt den konfigurierten verschachtelten Aufwand nicht.
>
> DashScope-Qwen-Modelle sind eine weitere Ausnahme: Ihr Anbieter liest `reasoning` direkt und bildet es auf `reasoning_effort` oder `enable_thinking` ab. Bei den Familien mit gestaffeltem Aufwand (`qwen3.8-max`, `qwen-latest-series-invite-*`, `qwen4*`) haben anbieterspezifische `samplingParams`-Felder weiterhin Vorrang, wenn die Netzwerkparameter widersprüchlich sind; bei älteren Qwen-Hybriden kollabiert ein konfigurierter Aufwandslevel zu `enable_thinking: true`, was einen `samplingParams.enable_thinking`-Wert überschreibt.
>
> Bei anderen Modellen fügen Sie den Reasoning-Regler des Anbieters direkt hinzu, wenn Sie `samplingParams` verwenden – bei DeepSeek ist dies `samplingParams.reasoning_effort`. Bekannte GPT-Modelle bilden den konfigurierten Aufwand automatisch ab; fügen Sie nur eine rohe Überschreibung hinzu, wenn Sie diese Abbildung absichtlich umgehen. Rohe verschachtelte `reasoning`, einschließlich `null`, bleiben eine Ganzobjekt-Überschreibung, solange Reasoning aktiviert ist. Das Deaktivieren über `reasoning: false` oder auf Anfrageebene `includeThoughts: false` entfernt den verschachtelten Wert, einschließlich roher Überschreibungen in beiden Ebenen. Nicht-OpenRouter-GPT-Anfragen senden dann `reasoning_effort: 'none'`, wenn das Deaktivieren erlaubt ist; OpenRouter verwendet stattdessen sein verschachteltes Deaktivierungsfeld. Modelle mit verpflichtendem Denken erhalten keinen Ersatz. Außerhalb von OpenRouter hängt seine Bedeutung vom Gateway ab, daher zeigen die Modellsteuerungen den Modellstandard an. Jede rohe Überschreibung, die eine konfigurierte Stufe blockiert, führt dazu, dass eine explizite Stufenänderung fehlschlägt, ohne eine Präferenz zu speichern. Der Denk-Schalter stellt konfigurierte rohe Standards nach dem Deaktivieren nur wieder her, wenn sie das Denken erlauben. Wenn der rohe Zustand oder die konfigurierte Reasoning-Voreinstellung „off“ ist, kann der Denk-Schalter nicht eingeschaltet werden und die gespeicherte Präferenz bleibt erhalten. Dies gilt auch, wenn explizite Fähigkeiten keine Standardstufe enthalten oder nur einen Denk-Schalter offenlegen. Ein expliziter Standardbefehl setzt die Präferenz dennoch zurück. Entfernen Sie die blockierende rohe Überschreibung, um eine andere Stufe zu wählen.
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

### Anbietermodell

- Definiert in der `modelProviders`-Konfiguration
- Verfügt über ein vollständiges, atomares Konfigurationspaket
- Bei Auswahl wird seine Konfiguration als undurchdringliche Ebene angewendet
- Erscheint in der `/model`-Befehlsliste mit vollständigen Metadaten (Name, Beschreibung, Fähigkeiten)
- Empfohlen für Multi-Model-Workflows und Team-Konsistenz

### Laufzeitmodell

- Wird dynamisch erstellt, wenn Raw-Modell-IDs über CLI (`--model`), Umgebungsvariablen oder Einstellungen verwendet werden
- Nicht definiert in `modelProviders`
- Die Konfiguration wird durch „Projektion“ über Auflösungsebenen erstellt (CLI → env → settings → defaults)
- Wird automatisch als **RuntimeModelSnapshot** erfasst, wenn eine vollständige Konfiguration erkannt wird
- Ermöglicht Wiederverwendung ohne erneute Eingabe der Zugangsdaten

### Lebenszyklus des RuntimeModelSnapshot

Wenn Sie ein Modell konfigurieren, ohne `modelProviders` zu verwenden, erstellt Qwen Code automatisch einen RuntimeModelSnapshot, um Ihre Konfiguration zu bewahren:

```bash
# This creates a RuntimeModelSnapshot with ID: $runtime|openai|my-custom-model
qwen --auth-type openai --model my-custom-model --openai-api-key $KEY --openai-base-url https://api.example.com/v1
```

Der Snapshot:

- Erfasst Modell-ID, API-Schlüssel, Basis-URL und Generierungskonfiguration
- Bleibt über Sitzungen hinweg bestehen (gespeichert im Speicher während der Laufzeit)
- Erscheint in der Befehlsliste von `/model` als Laufzeitoption
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
