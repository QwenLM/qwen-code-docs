# PRD zum Assistenten für die Einrichtung benutzerdefinierter API-Schlüssel

## Zusammenfassung

Verbessere die `/auth -> API-Key -> Benutzerdefinierter API-Key`-Erfahrung, indem der aktuelle dokumentationsbasierte Bildschirm durch einen interaktiven Einrichtungsassistenten für benutzerdefinierte API-Anbieter ersetzt wird.

Qwen Code unterstützt mehrere API-Protokolle über die Schlüssel `authType` / `modelProviders`, darunter `openai`, `anthropic` und `gemini`. Daher sollte der Assistent für benutzerdefinierte Einrichtungen zunächst den Benutzer auffordern, das Protokoll auszuwählen, und dann Endpunkt-, Schlüssel- und Modellinformationen für dieses Protokoll sammeln.

Der Assistent führt den Benutzer durch:

```text
Protokoll auswählen → Basis-URL eingeben → API-Key eingeben → Modell-IDs eingeben → JSON überprüfen → Speichern + authentifizieren
```

Dies hält die Einrichtung benutzerdefinierter API-Schlüssel innerhalb von Qwen Code, reduziert die Notwendigkeit, `settings.json` manuell zu bearbeiten, und macht die endgültige Konfiguration transparent, indem das erzeugte JSON vor dem Speichern angezeigt wird.

## Hintergrund

Derzeit zeigt die Auswahl von `Benutzerdefinierter API-Key` in `/auth` einen statischen Informationsbildschirm:

```text
Benutzerdefinierte Konfiguration

Sie können Ihren API-Key und Ihre Modelle in settings.json konfigurieren

Weitere Anweisungen finden Sie in der Dokumentation
https://qwenlm.github.io/qwen-code-docs/de/users/configuration/model-providers/

Esc zum Zurückgehen
```

Dies erfordert, dass der Benutzer die CLI verlässt, Dokumentation liest, `settings.json` versteht, `modelProviders` manuell konfiguriert, einen `envKey` auswählt, API-Keys hinzufügt und dann zu Qwen Code zurückkehrt. Benutzer haben berichtet, dass dieser Ablauf schwierig und vom Rest der `/auth`-Erfahrung losgelöst ist.

Der aktuelle Pfad für den Standard-API-Key von ModelStudio bietet bereits eine geführte Einrichtung:

```text
Alibaba Cloud ModelStudio Standard API-Key
└─ Region auswählen
   └─ API-Key eingeben
      └─ Modell-IDs eingeben
         └─ Speichern + authentifizieren
```

Die Einrichtung benutzerdefinierter API-Schlüssel sollte eine ähnlich geführte Erfahrung bieten, dabei aber berücksichtigen, dass Qwen Code mehrere Anbieterprotokolle unterstützt.

## Problemstellung

Der Pfad für benutzerdefinierte API-Schlüssel ist derzeit eine Sackgasse innerhalb von `/auth`:

```text
/auth
└─ Authentifizierungsmethode auswählen
   ├─ Alibaba Cloud Coding Plan
   ├─ API-Key
   │  └─ API-Key-Typ auswählen
   │     ├─ Alibaba Cloud ModelStudio Standard API-Key
   │     │  ├─ Region auswählen
   │     │  ├─ API-Key eingeben
   │     │  ├─ Modell-IDs eingeben
   │     │  └─ Speichern + authentifizieren
   │     │
   │     └─ Benutzerdefinierter API-Key
   │        └─ Nur-Dokumentationsbildschirm
   │
   └─ Qwen OAuth
```

Dies verursacht mehrere Benutzerfreundlichkeitsprobleme:

- Benutzer können die Einrichtung benutzerdefinierter Anbieter nicht von `/auth` aus abschließen.
- Benutzer müssen Low-Level-Einstellungskonzepte verstehen, bevor sie sich authentifizieren können.
- Benutzer wissen möglicherweise nicht, welche Felder erforderlich sind: `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name` und `security.auth.selectedType`.
- Benutzer könnten versehentlich mit vorhandenen Umgebungsvariablen kollidieren oder bestehende Anbieterkonfigurationen überschreiben.
- Benutzer erhalten nach dem manuellen Bearbeiten der Einstellungen kein sofortiges Authentifizierungsfeedback.

## Ziele

1. Benutzern ermöglichen, einen benutzerdefinierten API-Anbieter vollständig innerhalb von `/auth` zu konfigurieren.
2. Die wichtigsten von Qwen Code in `modelProviders` unterstützten Protokolle unterstützen: `openai`, `anthropic` und `gemini`.
3. Den Ablauf nah am bestehenden ModelStudio-Standardablauf halten.
4. `baseUrl` als das Äquivalent des benutzerdefinierten Anbieters zur Regionsauswahl behandeln.
5. Automatisch einen von Qwen verwalteten privaten `envKey` aus dem ausgewählten Protokoll und der eingegebenen `baseUrl` generieren.
6. Den API-Key unter `settings.json.env` speichern, konsistent mit dem aktuellen Muster der von Qwen verwalteten Anmeldeinformationen.
7. Konflikte mit Shell-Umgebungsvariablen des Benutzers vermeiden, indem ein Qwen-spezifischer, generierter Schlüsselname verwendet wird.
8. Das generierte JSON vor dem Speichern anzeigen, damit der Benutzer die genauen Einstellungsänderungen überprüfen kann.
9. Nicht verwandte vorhandene `modelProviders`-Einträge erhalten.
10. Sofort nach dem Speichern authentifizieren und Erfolgs- oder Fehlerfeedback anzeigen.

## Nicht-Ziele

1. Nicht verlangen, dass Benutzer `envKey` manuell eingeben.
2. Kein separates Konzept für den Anbieternamen einführen.
3. Keine erweiterten `generationConfig`, `capabilities` oder modellspezifischen Überschreibungen im Assistenten hinzufügen.
4. Den Dokumentationslink nicht vollständig entfernen; er sollte für erweiterte Konfiguration weiterhin verfügbar sein.
5. Die bestehenden Abläufe für Coding Plan oder ModelStudio Standard API-Key nicht ändern.
6. In der ersten Version kein automatisches Erkennen des Protokolls aus der `baseUrl` versuchen; Benutzer wählen das Protokoll explizit aus.

## Zielbenutzer

- Benutzer, die einen eigenen benutzerdefinierten API-Endpunkt mitbringen.
- Benutzer, die Anbieter wie OpenAI-kompatible APIs, Anthropic-kompatible APIs, Gemini-kompatible APIs, vLLM, Ollama, LM Studio oder interne Gateways konfigurieren.
- Benutzer, die die Authentifizierung lieber von der CLI aus einrichten als `settings.json` manuell zu bearbeiten.

## Unterstützte Protokolle

Der Assistent sollte zunächst diese Protokolloptionen anbieten:

```text
openai
anthropic
gemini
```

Jedes Protokoll bildet direkt auf einen `modelProviders`-Schlüssel und den Wert `security.auth.selectedType` ab.

| Protokolloption        | Auth-Typ / modelProviders-Schlüssel | Hinweise                                                                                       |
| ---------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel      | `openai`                            | OpenAI, OpenRouter, Fireworks, lokale OpenAI-kompatible Server, interne Gateways                 |
| Anthropic-kompatibel   | `anthropic`                         | Anthropic-kompatible Endpunkte                                                                  |
| Gemini-kompatibel      | `gemini`                            | Gemini-kompatible Endpunkte                                                                     |

## Benutzererfahrung – Überblick

### Aktualisierter `/auth`-Baum

```text
/auth
└─ Authentifizierungsmethode auswählen
   ├─ Alibaba Cloud Coding Plan
   │  └─ Region auswählen
   │     └─ API-Key eingeben
   │        └─ Speichern + authentifizieren
   │
   ├─ API-Key
   │  └─ API-Key-Typ auswählen
   │     ├─ Alibaba Cloud ModelStudio Standard API-Key
   │     │  ├─ Region auswählen
   │     │  ├─ API-Key eingeben
   │     │  ├─ Modell-IDs eingeben
   │     │  └─ Speichern + authentifizieren
   │     │
   │     └─ Benutzerdefinierter API-Key
   │        ├─ Protokoll auswählen
   │        ├─ Basis-URL eingeben
   │        ├─ API-Key eingeben
   │        ├─ Modell-IDs eingeben
   │        ├─ Generiertes JSON überprüfen
   │        └─ Speichern + authentifizieren
   │
   └─ Qwen OAuth
```

### Zustandsautomat für benutzerdefinierte API-Schlüssel

```text
api-key-type-select
  │
  └─ CUSTOM_API_KEY
      │
      ▼
custom-protocol-select
      │ Eingabe
      ▼
custom-base-url-input
      │ Eingabe
      │ envKey aus Protokoll + baseUrl generieren
      ▼
custom-api-key-input
      │ Eingabe
      ▼
custom-model-id-input
      │ Eingabe
      ▼
custom-review-json
      │ Eingabe
      ▼
Einstellungen speichern + refreshAuth(selectedProtocol)
```

### Escape-Verhalten

```text
custom-review-json
  Esc -> custom-model-id-input

custom-model-id-input
  Esc -> custom-api-key-input

custom-api-key-input
  Esc -> custom-base-url-input

custom-base-url-input
  Esc -> custom-protocol-select

custom-protocol-select
  Esc -> api-key-type-select
```

## Detailliertes Interaktionsdesign

### Schritt 1: Protokoll auswählen

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Protokoll auswählen           │
│                                                              │
│  ◉ OpenAI-kompatibel                                         │
│    OpenAI, OpenRouter, Fireworks, vLLM, Ollama, LM Studio    │
│                                                              │
│  ○ Anthropic-kompatibel                                      │
│    Anthropic-kompatible Endpunkte                            │
│                                                              │
│  ○ Gemini-kompatibel                                         │
│    Gemini-kompatible Endpunkte                               │
│                                                              │
│ Eingabe zum Auswählen, ↑↓ zum Navigieren, Esc zum Zurückgehen│
└──────────────────────────────────────────────────────────────┘
```

Das ausgewählte Protokoll bestimmt:

- Den zu aktualisierenden `modelProviders`-Schlüssel.
- Den zu speichernden Wert von `security.auth.selectedType`.
- Die Protokollbezeichnung auf späteren Bildschirmen.
- Den nach dem Speichern verwendeten Auth-Typ für `refreshAuth()`.

### Schritt 2: Basis-URL eingeben

`baseUrl` ist das Äquivalent des benutzerdefinierten Anbieters zur Regionsauswahl. Sie sollte vor der Eingabe des API-Keys kommen, da sie bestimmt, zu welchem Endpunkt der API-Key gehört.

Für OpenAI-kompatibel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Basis-URL                     │
│                                                              │
│ Protokoll: OpenAI-kompatibel                                 │
│                                                              │
│ Geben Sie den OpenAI-kompatiblen API-Endpunkt ein.           │
│                                                              │
│ Basis-URL: https://openrouter.ai/api/v1_                    │
│                                                              │
│ Beispiele:                                                   │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Eingabe zum Fortfahren, Esc zum Zurückgehen                  │
└──────────────────────────────────────────────────────────────┘
```

Für Anthropic-kompatibel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Basis-URL                     │
│                                                              │
│ Protokoll: Anthropic-kompatibel                              │
│                                                              │
│ Geben Sie den Anthropic-kompatiblen API-Endpunkt ein.        │
│                                                              │
│ Basis-URL: https://api.anthropic.com/v1_                    │
│                                                              │
│ Eingabe zum Fortfahren, Esc zum Zurückgehen                  │
└──────────────────────────────────────────────────────────────┘
```

Für Gemini-kompatibel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Basis-URL                     │
│                                                              │
│ Protokoll: Gemini-kompatibel                                 │
│                                                              │
│ Geben Sie den Gemini-kompatiblen API-Endpunkt ein.           │
│                                                              │
│ Basis-URL: https://generativelanguage.googleapis.com_        │
│                                                              │
│ Eingabe zum Fortfahren, Esc zum Zurückgehen                  │
└──────────────────────────────────────────────────────────────┘
```

Validierung:

- Erforderlich.
- Muss mit `http://` oder `https://` beginnen.
- Führende und nachfolgende Leerzeichen entfernen.
- Die normalisierte Zeichenfolge wie eingegeben beibehalten, außer Kürzung.

Bei gültiger Eingabe:

- Den von Qwen verwalteten `envKey` aus dem ausgewählten Protokoll und der `baseUrl` generieren.
- Zur API-Key-Eingabe wechseln.

### Schritt 3: API-Key eingeben

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · API-Key                       │
│                                                              │
│ Protokoll: OpenAI-kompatibel                                 │
│ Endpunkt: https://openrouter.ai/api/v1                       │
│                                                              │
│ Geben Sie den API-Key für diesen Endpunkt ein.                │
│                                                              │
│ API-Key: sk-or-v1-••••••••••••••••_                         │
│                                                              │
│ Eingabe zum Fortfahren, Esc zum Zurückgehen                  │
└──────────────────────────────────────────────────────────────┘
```

Validierung:

- Erforderlich.
- Führende und nachfolgende Leerzeichen entfernen.

Hinweise:

- Die Eingabe kann zunächst das vorhandene Texteingabeverhalten verwenden, um Konsistenz mit benachbarten Abläufen zu gewährleisten.
- Der Überprüfungsbildschirm sollte den API-Key maskieren.

### Schritt 4: Modell-IDs eingeben

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Modell-IDs                    │
│                                                              │
│ Protokoll: OpenAI-kompatibel                                 │
│ Endpunkt: https://openrouter.ai/api/v1                       │
│                                                              │
│ Geben Sie eine oder mehrere Modell-IDs ein, getrennt durch  │
│ Kommas.                                                      │
│                                                              │
│ Modell-IDs: qwen/qwen3-coder,openai/gpt-4.1_                │
│                                                              │
│ Eingabe zum Fortfahren, Esc zum Zurückgehen                  │
└──────────────────────────────────────────────────────────────┘
```

Validierung:

- Erforderlich.
- Durch Komma trennen.
- Jede Modell-ID kürzen.
- Leere Einträge entfernen.
- Doppelte Einträge entfernen, Reihenfolge beibehalten.
- Mindestens eine Modell-ID muss übrig bleiben.

Modellbenennung:

- `id` und `name` sollen identisch sein.
- Es wird kein separater Anbietername vom Benutzer abgefragt.

Beispiel:

```text
Eingabe:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalisiert:
qwen/qwen3-coder, openai/gpt-4.1
```

### Schritt 5: JSON überprüfen

Vor dem Speichern wird der generierte JSON-Auszug angezeigt, der in `settings.json` geschrieben oder eingefügt wird.

OpenAI-kompatibles Beispiel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Überprüfung                    │
│                                                              │
│ Das folgende JSON wird in settings.json gespeichert:         │
│                                                              │
│ {                                                            │
│   "env": {                                                   │
│     "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1":│
│       "sk-••••••••••••••••"                                  │
│   },                                                         │
│   "modelProviders": {                                        │
│     "openai": [                                              │
│       {                                                      │
│         "id": "qwen/qwen3-coder",                           │
│         "name": "qwen/qwen3-coder",                         │
│         "baseUrl": "https://openrouter.ai/api/v1",          │
│         "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"│
│       }                                                      │
│     ]                                                        │
│   },                                                         │
│   "security": {                                              │
│     "auth": {                                                │
│       "selectedType": "openai"                              │
│     }                                                        │
│   },                                                         │
│   "model": {                                                 │
│     "name": "qwen/qwen3-coder"                              │
│   }                                                          │
│ }                                                            │
│                                                              │
│ Eingabe zum Speichern, Esc zum Zurückgehen                   │
└──────────────────────────────────────────────────────────────┘
```

Anthropic-kompatibles Beispiel:

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1": "sk-••••"
  },
  "modelProviders": {
    "anthropic": [
      {
        "id": "claude-sonnet-4-5",
        "name": "claude-sonnet-4-5",
        "baseUrl": "https://api.anthropic.com/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "anthropic"
    }
  },
  "model": {
    "name": "claude-sonnet-4-5"
  }
}
```

Das angezeigte JSON sollte:

- Das ausgewählte Protokoll als `modelProviders`-Schlüssel verwenden.
- Das ausgewählte Protokoll als `security.auth.selectedType` verwenden.
- Den tatsächlich generierten `envKey` verwenden.
- Den API-Key maskieren.
- Die vom Benutzer eingegebene `baseUrl` verwenden.
- Für jedes Modell `id === name` setzen.
- `model.name` auf die erste normalisierte Modell-ID setzen.

Falls das JSON für das aktuelle Terminal zu breit ist, ist ein Umbruch akzeptabel. Ziel ist Transparenz, nicht ein zum Kopieren perfektes Format.

### Schritt 6: Speichern und authentifizieren

Bei Eingabe vom Überprüfungsbildschirm:

```text
save:
  env[generatedEnvKey] = apiKey
  modelProviders[selectedProtocol] = [
    ...new custom configs using generatedEnvKey,
    ...existing configs whose envKey !== generatedEnvKey
  ]
  security.auth.selectedType = selectedProtocol
  model.name = firstModelId
  reloadModelProvidersConfig()
  refreshAuth(selectedProtocol)
```

Erfolgsmeldung:

```text
Benutzerdefinierter API-Key erfolgreich authentifiziert. Einstellungen mit generiertem EnvKey und Modellanbieterkonfiguration aktualisiert.
Tipp: Verwenden Sie /model, um zwischen konfigurierten Modellen zu wechseln.
```

Fehlermeldung sollte das bestehende Authentifizierungsfehlermuster beibehalten, mit zusätzlichen benutzerfreundlichen Hinweisen, falls möglich:

```text
Authentifizierung fehlgeschlagen. Meldung: <Fehler>

Bitte überprüfen Sie:
- Die Basis-URL ist mit dem ausgewählten Protokoll kompatibel
- Der API-Key ist für diesen Endpunkt gültig
- Die Modell-ID existiert für diesen Anbieter
```

## EnvKey-Generierung

Der Assistent sollte Benutzer nicht auffordern, einen `envKey` einzugeben.

Von Qwen verwaltete API-Schlüssel werden in `settings.json.env` gespeichert, daher sollte der EnvKey automatisch unter einem Qwen-spezifischen Namensraum generiert werden. Dies vermeidet Kollisionen mit benutzerverwalteten Shell-Umgebungsvariablen und verhindert, dass sich mehrere benutzerdefinierte Endpunkte gegenseitig überschreiben.

### Format

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Die Einbeziehung des Protokolls vermeidet Kollisionen, wenn derselbe Endpunkt unter verschiedenen Protokolladaptern verwendet wird.

### Beispiele

```text
Protokoll: openai
Basis-URL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protokoll: openai
Basis-URL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protokoll: anthropic
Basis-URL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protokoll: gemini
Basis-URL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protokoll: openai
Basis-URL: http://localhost:11434/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTP_LOCALHOST_11434_V1
```

### Normalisierungsregel

```text
protocol
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _

baseUrl
  -> trim
  -> uppercase
  -> replace every non A-Z / 0-9 character with _
  -> collapse consecutive _ characters
  -> remove leading/trailing _

return QWEN_CUSTOM_API_KEY_${NORMALIZED_PROTOCOL}_${NORMALIZED_BASE_URL}
```

Pseudocode:

```ts
function generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string {
  const normalize = (value: string) =>
    value
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

  return `QWEN_CUSTOM_API_KEY_${normalize(protocol)}_${normalize(baseUrl)}`;
}
```
## Design der Einstellungen speichern

Angenommene Benutzereingabe:

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

Der Assistent soll Folgendes erzeugen:

```json
{
  "env": {
    "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1": "sk-or-v1-xxx"
  },
  "modelProviders": {
    "openai": [
      {
        "id": "qwen/qwen3-coder",
        "name": "qwen/qwen3-coder",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      },
      {
        "id": "openai/gpt-4.1",
        "name": "openai/gpt-4.1",
        "baseUrl": "https://openrouter.ai/api/v1",
        "envKey": "QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1"
      }
    ]
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen/qwen3-coder"
  }
}
```

Für `anthropic` wird dieselbe Struktur verwendet, außer:

```text
modelProviders.anthropic
security.auth.selectedType = anthropic
refreshAuth(anthropic)
```

Für `gemini` wird dieselbe Struktur verwendet, außer:

```text
modelProviders.gemini
security.auth.selectedType = gemini
refreshAuth(gemini)
```

### Persist-Scope

Verwende dieselbe Strategie für den Persist-Scope wie bei der Modellauswahl und den bestehenden API-Key-Flows:

```text
getPersistScopeForModelSelection(settings)
```

Dies gewährleistet Konsistenz mit den bestehenden Besitzregeln für `modelProviders`.

### Backup

Vor dem Schreiben wird die Zieldatei der Einstellungen gesichert, konsistent mit den bestehenden Abläufen von Coding Plan und ModelStudio Standard.

### Synchronisation der Prozess-Umgebungsvariablen

Nach dem Schreiben von `settings.json.env[generatedEnvKey]` sofort synchronisieren:

```text
process.env[generatedEnvKey] = apiKey
```

Dadurch kann `refreshAuth(selectedProtocol)` den neu eingegebenen Schlüssel in derselben Sitzung verwenden.

### Modell-Provider-Zusammenführungsregel

Für den generierten Umgebungsvariablenschlüssel:

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Aktualisiere `modelProviders[selectedProtocol]` wie folgt:

```text
newConfigs = normalizedModelIds.map(modelId => ({
  id: modelId,
  name: modelId,
  baseUrl,
  envKey: generatedEnvKey,
}))

existingConfigs = settings.merged.modelProviders?.[selectedProtocol] ?? []

preservedConfigs = existingConfigs.filter(config =>
  config.envKey !== generatedEnvKey
)

updatedConfigs = [
  ...newConfigs,
  ...preservedConfigs,
]
```

Begründung:

- Die Neukonfiguration desselben Protokolls + derselben `baseUrl` ersetzt alte Modelle für diesen Endpunkt.
- Die Konfiguration eines anderen Protokolls oder einer anderen `baseUrl` verwendet einen anderen Umgebungsvariablenschlüssel und überschreibt keine vorherigen benutzerdefinierten Endpunkte.
- Coding Plan, ModelStudio Standard und andere Benutzerkonfigurationen bleiben erhalten, es sei denn, sie verwenden denselben generierten Umgebungsvariablenschlüssel unter demselben Protokoll.
- Neue Konfigurationen werden zuerst platziert, sodass die neu konfigurierten Modelle sofort sichtbar und standardmäßig ausgewählt sind.

## Fehlerbehandlung

### Protokollvalidierungsfehler

Das Protokoll muss einer der folgenden Werte sein:

```text
openai
anthropic
gemini
```

### Base-URL-Validierungsfehler

```text
Base URL darf nicht leer sein.
```

```text
Base URL muss mit http:// oder https:// beginnen.
```

### API-Key-Validierungsfehler

```text
API key darf nicht leer sein.
```

### Modell-IDs-Validierungsfehler

```text
Model IDs dürfen nicht leer sein.
```

### Authentifizierungsfehler

Verwende nach Möglichkeit den bestehenden Fehlermechanismus, aber die benutzerseitige Fehlermeldung sollte dem Benutzer helfen, sich zu erholen:

```text
Authentifizierung fehlgeschlagen. Nachricht: <message>

Bitte überprüfen:
- Base URL ist mit dem ausgewählten Protokoll kompatibel
- API key ist für diesen Endpunkt gültig
- Model ID existiert für diesen Anbieter
```

## Dokumentationslink

Der Assistent sollte weiterhin die bestehende Dokumentation zu Modellanbietern für fortgeschrittene Benutzer anzeigen.

Empfohlene Platzierung:

- In der Fußzeile des Überprüfungsbildschirms, oder
- Als sekundärer Text auf dem Base-URL-Bildschirm.

Vorgeschlagener Text:

```text
Erweiterte generationConfig oder Fähigkeiten benötigt? Siehe:
https://qwenlm.github.io/qwen-code-docs/en/users/configuration/model-providers/
```

## Implementierungshinweise

Erwartete `AuthDialog`-Ansichtsebenen:

```ts
type ViewLevel =
  | 'main'
  | 'region-select'
  | 'api-key-input'
  | 'api-key-type-select'
  | 'alibaba-standard-region-select'
  | 'alibaba-standard-api-key-input'
  | 'alibaba-standard-model-id-input'
  | 'custom-protocol-select'
  | 'custom-base-url-input'
  | 'custom-api-key-input'
  | 'custom-model-id-input'
  | 'custom-review-json';
```

Erwarteter benutzerdefinierter Protokolltyp:

```ts
type CustomApiProtocol =
  | AuthType.USE_OPENAI
  | AuthType.USE_ANTHROPIC
  | AuthType.USE_GEMINI;
```

Erwarteter neuer Zustand in `AuthDialog`:

```ts
const [customProtocol, setCustomProtocol] = useState<CustomApiProtocol>(
  AuthType.USE_OPENAI,
);
const [customProtocolIndex, setCustomProtocolIndex] = useState<number>(0);
const [customBaseUrl, setCustomBaseUrl] = useState('');
const [customBaseUrlError, setCustomBaseUrlError] = useState<string | null>(
  null,
);
const [customApiKey, setCustomApiKey] = useState('');
const [customApiKeyError, setCustomApiKeyError] = useState<string | null>(null);
const [customModelIds, setCustomModelIds] = useState('');
const [customModelIdsError, setCustomModelIdsError] = useState<string | null>(
  null,
);
```

Erwartete neue UI-Aktion:

```ts
handleCustomApiKeySubmit: (
  protocol: CustomApiProtocol,
  baseUrl: string,
  apiKey: string,
  modelIdsInput: string,
) => Promise<void>;
```

Erwartete Hilfsfunktionen:

```ts
generateCustomApiKeyEnvKey(protocol: string, baseUrl: string): string
normalizeCustomModelIds(modelIdsInput: string): string[]
maskApiKey(apiKey: string): string
```

## Akzeptanzkriterien

### UX

- Die Auswahl `/auth -> API Key -> Custom API Key` öffnet den benutzerdefinierten Assistenten anstatt der Nur-Dokumentationsseite.
- Der erste Schritt des benutzerdefinierten Assistenten fragt nach dem Protokoll.
- Der zweite Schritt fragt nach der Base URL und zeigt das ausgewählte Protokoll an.
- Der dritte Schritt fragt nach dem API-Key und zeigt das ausgewählte Protokoll und den Endpunkt an.
- Der vierte Schritt fragt nach den Modell-IDs und zeigt das ausgewählte Protokoll und den Endpunkt an.
- Der Überprüfungsschritt zeigt das generierte JSON an, einschließlich maskiertem API-Key, ausgewähltem Protokoll und generiertem Umgebungsvariablenschlüssel.
- Drücken der Eingabetaste im Überprüfungsschritt speichert die Einstellungen und versucht die Authentifizierung.
- Drücken der Escape-Taste navigiert einen Schritt zurück.

### Einstellungen

- Der API-Key wird in `settings.json.env[generatedEnvKey]` geschrieben.
- `generatedEnvKey` wird aus dem ausgewählten Protokoll und `baseUrl` unter Verwendung des privaten Qwen-Namespace abgeleitet.
- `modelProviders[selectedProtocol]` erhält einen Eintrag pro normalisierter Modell-ID.
- Jeder benutzerdefinierte Modelleintrag verwendet `id === name`.
- `security.auth.selectedType` wird auf das ausgewählte Protokoll gesetzt.
- `model.name` wird auf die erste normalisierte Modell-ID gesetzt.
- Vorhandene Einträge unter `modelProviders[selectedProtocol]` mit einem anderen `envKey` bleiben erhalten.
- Vorhandene Einträge unter `modelProviders[selectedProtocol]` mit demselben generierten `envKey` werden ersetzt.
- Einträge unter anderen `modelProviders`-Protokollschlüsseln bleiben erhalten.

### Authentifizierung

- Der generierte Umgebungsvariablenschlüssel wird vor dem Aktualisieren der Authentifizierung mit `process.env` synchronisiert.
- Die App lädt die Modellanbieterkonfiguration neu, bevor `refreshAuth(selectedProtocol)` aufgerufen wird.
- Erfolgreiche Authentifizierung schließt den Auth-Dialog und zeigt eine Erfolgsmeldung.
- Fehlgeschlagene Authentifizierung belässt den Benutzer im Auth-Flow und zeigt eine umsetzbare Fehlermeldung.

### Tests

- Füge `AuthDialog`-Tests hinzu oder aktualisiere sie, um den benutzerdefinierten Assistentenpfad abzudecken.
- Füge Tests für die Protokollauswahl hinzu.
- Füge Tests für die Generierung des Umgebungsvariablenschlüssels aus Protokoll und Base URL hinzu.
- Füge Tests für die Normalisierung und Deduplizierung von Modell-IDs hinzu.
- Füge Tests für das Zusammenführungsverhalten der Einstellungen hinzu:
  - Derselbe generierte Umgebungsvariablenschlüssel ersetzt alte benutzerdefinierte Einträge unter demselben Protokoll;
  - Unterschiedliche Umgebungsvariablenschlüssel bleiben erhalten;
  - Andere Protokollschlüssel bleiben erhalten;
  - Coding Plan und ModelStudio Standard Einträge bleiben erhalten.
- Füge Tests für die Vorschau des generierten JSON-Inhalts hinzu, soweit praktikabel.

## Offene Fragen

1. Soll der API-Key während der Eingabe maskiert werden, oder nur auf dem Überprüfungsbildschirm?
2. Sollten lokale Endpunkte wie `http://localhost:11434/v1` leere oder Platzhalter-API-Keys für Server erlauben, die keine Authentifizierung erfordern?
3. Soll die generierte JSON-Vorschau nur den anzuwendenden Patch anzeigen oder den resultierenden vollständigen relevanten Einstellungsuntersbaum nach dem Zusammenführen?
4. Soll Vertex AI in diesen benutzerdefinierten API-Key-Assistenten aufgenommen werden oder außen vor bleiben, da sich dessen Authentifizierungseinrichtung von einfachen API-Key-Anbietern unterscheidet?

Für die erste Version werden folgende Standardeinstellungen empfohlen:

- Unterstützt `openai`, `anthropic` und `gemini`.
- Verwende das bestehende Eingabeverhalten während der Eingabe.
- Erfordere einen nicht leeren API-Key aus Konsistenzgründen mit API-Key-Authentifizierungsflows.
- Zeige das Patch-Format-JSON an, das gespeichert oder aktualisiert wird.
- Lass Vertex AI außerhalb des benutzerdefinierten API-Key-Assistenten, bis eine separate Produktentscheidung getroffen wurde.