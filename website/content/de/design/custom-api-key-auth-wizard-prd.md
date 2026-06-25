# PRD: Custom API Key Auth Wizard

## Zusammenfassung

Verbesserung des Ablaufs `/auth -> API Key -> Custom API Key`, indem der bisherige rein dokumentationsbasierte Bildschirm durch einen interaktiven Einrichtungsassistenten im Terminal für benutzerdefinierte API-Anbieter ersetzt wird.

Qwen Code unterstützt mehrere API-Protokolle über die Schlüssel `authType` / `modelProviders`, darunter `openai`, `anthropic` und `gemini`. Daher sollte der Assistent für die benutzerdefinierte Einrichtung zunächst die Benutzer auffordern, das Protokoll auszuwählen, und anschließend Endpunkt-, Schlüssel- und Modellinformationen für dieses Protokoll erfassen.

Der Assistent führt Benutzer durch:

```text
Protokoll auswählen → Basis-URL eingeben → API-Schlüssel eingeben → Modell-IDs eingeben → JSON prüfen → Speichern + authentifizieren
```

Dies hält die Einrichtung des benutzerdefinierten API-Schlüssels innerhalb von Qwen Code, reduziert die Notwendigkeit, `settings.json` manuell zu bearbeiten, und macht die endgültige Konfiguration transparent, indem das generierte JSON vor dem Speichern angezeigt wird.

## Hintergrund

Derzeit zeigt die Auswahl von `Custom API Key` in `/auth` einen statischen Informationsbildschirm:

```text
Benutzerdefinierte Konfiguration

Sie können Ihren API-Schlüssel und Ihre Modelle in settings.json konfigurieren

Weitere Anweisungen finden Sie in der Dokumentation
https://qwenlm.github.io/qwen-code-docs/de/users/configuration/model-providers/

Esc zum Zurückgehen
```

Dies erfordert, dass Benutzer die CLI verlassen, die Dokumentation lesen, `settings.json` verstehen, `modelProviders` manuell konfigurieren, einen `envKey` auswählen, API-Schlüssel hinzufügen und dann zu Qwen Code zurückkehren. Benutzer haben berichtet, dass dieser Ablauf schwierig und vom restlichen `/auth`-Erlebnis losgelöst ist.

Der bestehende Pfad für den ModelStudio Standard API-Schlüssel bietet bereits einen geführten Einrichtungsablauf:

```text
Alibaba Cloud ModelStudio Standard API-Schlüssel
└─ Region auswählen
   └─ API-Schlüssel eingeben
      └─ Modell-IDs eingeben
         └─ Speichern + authentifizieren
```

Die Einrichtung eines benutzerdefinierten API-Schlüssels sollte ein ähnlich geführtes Erlebnis bieten, dabei aber berücksichtigen, dass Qwen Code mehrere Anbieterprotokolle unterstützt.

## Problemstellung

Der Pfad für benutzerdefinierte API-Schlüssel endet derzeit in einer Sackgasse innerhalb von `/auth`:

```text
/auth
└─ Authentifizierungsmethode auswählen
   ├─ Alibaba Cloud Coding Plan
   ├─ API-Schlüssel
   │  └─ API-Schlüsseltyp auswählen
   │     ├─ Alibaba Cloud ModelStudio Standard API-Schlüssel
   │     │  ├─ Region auswählen
   │     │  ├─ API-Schlüssel eingeben
   │     │  ├─ Modell-IDs eingeben
   │     │  └─ Speichern + authentifizieren
   │     │
   │     └─ Benutzerdefinierter API-Schlüssel
   │        └─ Nur Dokumentationsbildschirm
   │
   └─ Qwen OAuth
```

Dies verursacht mehrere Benutzerfreundlichkeitsprobleme:

- Benutzer können die Einrichtung eines benutzerdefinierten Anbieters nicht von `/auth` aus abschließen.
- Benutzer müssen Low-Level-Konfigurationskonzepte verstehen, bevor sie sich authentifizieren können.
- Benutzer wissen möglicherweise nicht, welche Felder erforderlich sind: `authType`, `baseUrl`, `envKey`, `modelProviders`, `model.name` und `security.auth.selectedType`.
- Benutzer könnten versehentlich mit vorhandenen Umgebungsvariablen in Konflikt geraten oder eine bestehende Anbieterkonfiguration überschreiben.
- Nach manueller Bearbeitung der Einstellungen erhalten Benutzer keine sofortige Authentifizierungsrückmeldung.

## Ziele

1. Benutzern ermöglichen, einen benutzerdefinierten API-Anbieter vollständig innerhalb von `/auth` zu konfigurieren.
2. Die wichtigsten Protokolle unterstützen, die Qwen Code in `modelProviders` unterstützt: `openai`, `anthropic` und `gemini`.
3. Den Ablauf nah am bestehenden ModelStudio Standard-Ablauf halten.
4. `baseUrl` als das benutzerdefinierte Äquivalent zu `region` behandeln.
5. Automatisch einen von Qwen verwalteten privaten `envKey` aus dem ausgewählten Protokoll und der eingegebenen `baseUrl` generieren.
6. Den API-Schlüssel unter `settings.json.env` speichern, konsistent mit dem aktuellen, von Qwen verwalteten Anmeldedatenmuster.
7. Konflikte mit Shell-Umgebungsvariablen des Benutzers vermeiden, indem ein von Qwen spezifisch generierter Schlüsselname verwendet wird.
8. Das generierte JSON vor dem Speichern anzeigen, damit Benutzer die genauen Einstellungsänderungen überprüfen können.
9. Nicht zusammenhängende vorhandene `modelProviders`-Einträge erhalten.
10. Sofort nach dem Speichern authentifizieren und Erfolgs- oder Fehlerrückmeldung anzeigen.

## Nicht-Ziele

1. Benutzer nicht zwingen, `envKey` manuell einzugeben.
2. Den Anbieternamen nicht als separates Konzept einführen.
3. Keine erweiterten `generationConfig`, `capabilities` oder modellspezifischen Überschreibungen zum Assistenten hinzufügen.
4. Den Dokumentationslink nicht vollständig entfernen; er sollte für erweiterte Konfiguration weiterhin verfügbar bleiben.
5. Die bestehenden Abläufe für Coding Plan oder ModelStudio Standard API-Schlüssel nicht ändern.
6. In der ersten Version nicht versuchen, das Protokoll automatisch aus der `baseUrl` zu erkennen; Benutzer wählen das Protokoll explizit aus.

## Zielgruppe

- Benutzer, die einen eigenen benutzerdefinierten API-Endpunkt mitbringen.
- Benutzer, die Anbieter wie OpenAI-kompatible APIs, Anthropic-kompatible APIs, Gemini-kompatible APIs, vLLM, Ollama, LM Studio oder interne Gateways konfigurieren.
- Benutzer, die die Authentifizierung lieber über die CLI einrichten, anstatt `settings.json` manuell zu bearbeiten.

## Unterstützte Protokolle

Der Assistent sollte zunächst diese Protokolloptionen anbieten:

```text
openai
anthropic
gemini
```

Jedes Protokoll wird direkt einem `modelProviders`-Schlüssel und dem Wert `security.auth.selectedType` zugeordnet.

| Protokolloption         | Auth-Typ / modelProviders-Schlüssel | Hinweise                                                                                                 |
| ----------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel       | `openai`                            | OpenAI, OpenRouter, Fireworks, lokale OpenAI-kompatible Server, interne Gateways                         |
| Anthropic-kompatibel    | `anthropic`                         | Anthropic-kompatible Endpunkte                                                                           |
| Gemini-kompatibel       | `gemini`                            | Gemini-kompatible Endpunkte                                                                              |
## Benutzeroberflächen-Überblick

### Aktualisierter `/auth`-Baum

```text
/auth
└─ Authentifizierungsmethode auswählen
   ├─ Alibaba Cloud Coding Plan
   │  └─ Region auswählen
   │     └─ API-Schlüssel eingeben
   │        └─ Speichern + authentifizieren
   │
   ├─ API-Schlüssel
   │  └─ API-Schlüssel-Typ auswählen
   │     ├─ Alibaba Cloud ModelStudio Standard API-Schlüssel
   │     │  ├─ Region auswählen
   │     │  ├─ API-Schlüssel eingeben
   │     │  ├─ Modell-IDs eingeben
   │     │  └─ Speichern + authentifizieren
   │     │
   │     └─ Benutzerdefinierter API-Schlüssel
   │        ├─ Protokoll auswählen
   │        ├─ Basis-URL eingeben
   │        ├─ API-Schlüssel eingeben
   │        ├─ Modell-IDs eingeben
   │        ├─ Generiertes JSON überprüfen
   │        └─ Speichern + authentifizieren
   │
   └─ Qwen OAuth
```

### Zustandsautomat für benutzerdefinierten API-Schlüssel

```text
api-key-type-select
  │
  └─ CUSTOM_API_KEY
      │
      ▼
custom-protocol-select
      │ Enter
      ▼
custom-base-url-input
      │ Enter
      │ envKey aus protocol + baseUrl generieren
      ▼
custom-api-key-input
      │ Enter
      ▼
custom-model-id-input
      │ Enter
      ▼
custom-review-json
      │ Enter
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
│ Benutzerdefinierter API-Schlüssel · Protokoll auswählen      │
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
│ Enter zur Auswahl, ↑↓ zum Navigieren, Esc zum Zurückgehen   │
└──────────────────────────────────────────────────────────────┘
```

Das ausgewählte Protokoll bestimmt:

- Den zu aktualisierenden `modelProviders`-Schlüssel.
- Den zu speichernden Wert von `security.auth.selectedType`.
- Die Bezeichnung des Protokolls, die auf späteren Bildschirmen angezeigt wird.
- Den nach dem Speichern verwendeten `refreshAuth()`-Authentifizierungstyp.

### Schritt 2: Basis-URL eingeben

`baseUrl` ist das Äquivalent zur Regionsauswahl beim benutzerdefinierten Anbieter. Sie sollte vor der Eingabe des API-Schlüssels kommen, da sie festlegt, zu welchem Endpunkt der API-Schlüssel gehört.

Für OpenAI-kompatibel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Schlüssel · Basis-URL                │
│                                                              │
│ Protokoll: OpenAI-kompatibel                                 │
│                                                              │
│ Geben Sie den OpenAI-kompatiblen API-Endpunkt ein.           │
│                                                              │
│ Basis-URL: https://openrouter.ai/api/v1_                     │
│                                                              │
│ Beispiele:                                                   │
│   OpenAI:      https://api.openai.com/v1                     │
│   OpenRouter: https://openrouter.ai/api/v1                   │
│   Fireworks:  https://api.fireworks.ai/inference/v1          │
│   Ollama:     http://localhost:11434/v1                      │
│   LM Studio:  http://localhost:1234/v1                       │
│                                                              │
│ Enter zum Fortfahren, Esc zum Zurückgehen                    │
└──────────────────────────────────────────────────────────────┘
```

Für Anthropic-kompatibel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Schlüssel · Basis-URL                │
│                                                              │
│ Protokoll: Anthropic-kompatibel                              │
│                                                              │
│ Geben Sie den Anthropic-kompatiblen API-Endpunkt ein.        │
│                                                              │
│ Basis-URL: https://api.anthropic.com/v1_                     │
│                                                              │
│ Enter zum Fortfahren, Esc zum Zurückgehen                    │
└──────────────────────────────────────────────────────────────┘
```

Für Gemini-kompatibel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Schlüssel · Basis-URL                │
│                                                              │
│ Protokoll: Gemini-kompatibel                                 │
│                                                              │
│ Geben Sie den Gemini-kompatiblen API-Endpunkt ein.           │
│                                                              │
│ Basis-URL: https://generativelanguage.googleapis.com_        │
│                                                              │
│ Enter zum Fortfahren, Esc zum Zurückgehen                    │
└──────────────────────────────────────────────────────────────┘
```
Validierung:

- Erforderlich.
- Muss mit `http://` oder `https://` beginnen.
- Führende und nachfolgende Leerzeichen entfernen.
- Den normalisierten String wie eingegeben beibehalten, abgesehen vom Trimmen.

Bei gültiger Eingabe:

- Generiere den von Qwen verwalteten `envKey` aus dem ausgewählten Protokoll und der `baseUrl`.
- Weiter zur API-Key-Eingabe.

### Schritt 3: API-Key eingeben

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · API-Key                        │
│                                                              │
│ Protokoll: OpenAI-kompatibel                                 │
│ Endpunkt: https://openrouter.ai/api/v1                       │
│                                                              │
│ Geben Sie den API-Key für diesen Endpunkt ein.               │
│                                                              │
│ API-Key: sk-or-v1-••••••••••••••••_                          │
│                                                              │
│ Enter zum Fortfahren, Esc zum Zurückgehen                    │
└──────────────────────────────────────────────────────────────┘
```

Validierung:

- Erforderlich.
- Führende und nachfolgende Leerzeichen entfernen.

Hinweise:

- Die Eingabe kann anfangs das bestehende Texteingabeverhalten zur Konsistenz mit benachbarten Flows verwenden.
- Der Überprüfungsbildschirm soll den API-Key maskieren.

### Schritt 4: Modell-IDs eingeben

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Modell-IDs                     │
│                                                              │
│ Protokoll: OpenAI-kompatibel                                 │
│ Endpunkt: https://openrouter.ai/api/v1                       │
│                                                              │
│ Geben Sie eine oder mehrere Modell-IDs ein, getrennt durch   │
│ Kommas.                                                      │
│                                                              │
│ Modell-IDs: qwen/qwen3-coder,openai/gpt-4.1_                │
│                                                              │
│ Enter zum Fortfahren, Esc zum Zurückgehen                    │
└──────────────────────────────────────────────────────────────┘
```

Validierung:

- Erforderlich.
- Durch Komma trennen.
- Jede Modell-ID trimmen.
- Leere Einträge entfernen.
- Dubletten entfernen, dabei die Reihenfolge beibehalten.
- Mindestens eine Modell-ID muss übrig bleiben.

Modellbenennung:

- `id` und `name` sollten identisch sein.
- Es wird kein separater Provider-Name vom Benutzer abgefragt.

Beispiel:

```text
Input:
qwen/qwen3-coder, openai/gpt-4.1, qwen/qwen3-coder

Normalized:
qwen/qwen3-coder, openai/gpt-4.1
```

### Schritt 5: JSON überprüfen

Vor dem Speichern wird das erstellte JSON-Snippet angezeigt, das in `settings.json` geschrieben oder eingefügt wird.

OpenAI-kompatibles Beispiel:

```text
┌──────────────────────────────────────────────────────────────┐
│ Benutzerdefinierter API-Key · Überprüfung                    │
│                                                              │
│ Das folgende JSON wird in settings.json gespeichert:        │
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
│ Enter zum Speichern, Esc zum Zurückgehen                     │
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

Wenn das JSON zu breit für das aktuelle Terminal ist, ist ein Umbruch akzeptabel. Ziel ist Transparenz, nicht eine perfekt kopierbare Formatierung.

### Schritt 6: Speichern und Authentifizieren

Bei Eingabe im Überprüfungsbildschirm:

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
Custom API Key erfolgreich authentifiziert. Einstellungen mit generiertem Env-Key und Modellanbieter-Konfiguration aktualisiert.
Tipp: Verwende /model, um zwischen konfigurierten Modellen zu wechseln.
```

Fehlermeldung sollte das bestehende Authentifizierungsfehler-Muster beibehalten, mit zusätzlichen benutzerfreundlichen Hinweisen, wenn möglich:

```text
Authentifizierung fehlgeschlagen. Nachricht: <error>

Bitte prüfen:
- Base URL ist mit dem ausgewählten Protokoll kompatibel
- API-Key ist für diesen Endpunkt gültig
- Modell-ID existiert für diesen Anbieter
```

## Env-Key-Generierung

Der Assistent soll Benutzer nicht auffordern, einen `envKey` einzugeben.

Von Qwen verwaltete API-Keys werden in `settings.json.env` gespeichert, daher sollte der Env-Key automatisch unter einem Qwen-spezifischen Namespace generiert werden. Dies vermeidet Konflikte mit benutzerseitig verwalteten Shell-Umgebungsvariablen und verhindert, dass mehrere benutzerdefinierte Endpunkte sich gegenseitig überschreiben.

### Format

```text
QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Die Aufnahme des Protokolls vermeidet Konflikte, wenn derselbe Endpunkt unter verschiedenen Protokolladaptern verwendet wird.

### Beispiele

```text
Protocol: openai
Base URL: https://api.openai.com/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_API_OPENAI_COM_V1

Protocol: openai
Base URL: https://openrouter.ai/api/v1
-> QWEN_CUSTOM_API_KEY_OPENAI_HTTPS_OPENROUTER_AI_API_V1

Protocol: anthropic
Base URL: https://api.anthropic.com/v1
-> QWEN_CUSTOM_API_KEY_ANTHROPIC_HTTPS_API_ANTHROPIC_COM_V1

Protocol: gemini
Base URL: https://generativelanguage.googleapis.com
-> QWEN_CUSTOM_API_KEY_GEMINI_HTTPS_GENERATIVELANGUAGE_GOOGLEAPIS_COM

Protocol: openai
Base URL: http://localhost:11434/v1
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

## Entwurf der Einstellungsschreibweise

Bei Benutzereingabe:

```text
Protocol: openai
Base URL: https://openrouter.ai/api/v1
API key: sk-or-v1-xxx
Model IDs: qwen/qwen3-coder,openai/gpt-4.1
```

Sollte der Assistent Folgendes erzeugen:

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

### Persistenzbereich

Verwende die gleiche Persistenzbereichsstrategie wie bei der Modellauswahl und den bestehenden API-Key-Flows:

```text
getPersistScopeForModelSelection(settings)
```

Dies hält das Verhalten konsistent mit den bestehenden `modelProviders`-Besitzregeln.

### Backup

Vor dem Schreiben ein Backup der Zieleinstellungsdatei erstellen, konsistent mit dem bestehenden Coding Plan- und ModelStudio Standard-Flows.

### Prozess-Env-Sync

Nach dem Schreiben von `settings.json.env[generatedEnvKey]` sofort synchronisieren:

```text
process.env[generatedEnvKey] = apiKey
```

Dies stellt sicher, dass `refreshAuth(selectedProtocol)` den neu eingegebenen Key in derselben Sitzung verwenden kann.
### Regel zum Zusammenführen von Modellanbietern

Für den generierten Umgebungs-Schlüssel:

```text
generatedEnvKey = QWEN_CUSTOM_API_KEY_${PROTOCOL}_${NORMALIZED_BASE_URL}
```

Aktualisieren Sie `modelProviders[selectedProtocol]` wie folgt:

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

- Eine Neukonfiguration desselben Protokolls + derselben `baseUrl` ersetzt alte Modelle für diesen Endpunkt.
- Die Konfiguration eines anderen Protokolls oder einer anderen `baseUrl` verwendet einen anderen Umgebungs-Schlüssel und überschreibt keine vorherigen benutzerdefinierten Endpunkte.
- Coding Plan, ModelStudio Standard und andere Benutzerkonfigurationen bleiben erhalten, es sei denn, sie verwenden denselben generierten Umgebungs-Schlüssel unter demselben Protokoll.
- Neue Konfigurationen werden zuerst platziert, sodass die neu konfigurierten Modelle sofort sichtbar und standardmäßig ausgewählt sind.

## Fehlerbehandlung

### Protokollvalidierungsfehler

Das Protokoll muss eines der folgenden sein:

```text
openai
anthropic
gemini
```

### Basis-URL-Validierungsfehler

```text
Basis-URL darf nicht leer sein.
```

```text
Basis-URL muss mit http:// oder https:// beginnen.
```

### API-Schlüssel-Validierungsfehler

```text
API-Schlüssel darf nicht leer sein.
```

### Modell-ID-Validierungsfehler

```text
Modell-IDs dürfen nicht leer sein.
```

### Authentifizierungsfehler

Verwenden Sie nach Möglichkeit den vorhandenen Fehlermechanismus, aber der benutzerseitige Fehler sollte Benutzern bei der Wiederherstellung helfen:

```text
Authentifizierung fehlgeschlagen. Nachricht: <message>

Bitte überprüfen Sie:
- Die Basis-URL ist mit dem ausgewählten Protokoll kompatibel
- Der API-Schlüssel ist für diesen Endpunkt gültig
- Die Modell-ID existiert für diesen Anbieter
```

## Dokumentationslink

Der Assistent sollte weiterhin die vorhandene Dokumentation zu Modellanbietern für fortgeschrittene Benutzer anzeigen.

Empfohlene Platzierung:

- In der Fußzeile des Überprüfungsbildschirms oder
- Als sekundärer Text auf dem Basis-URL-Bildschirm.

Vorgeschlagener Text:

```text
Benötigen Sie erweiterte generationConfig oder Fähigkeiten? Siehe:
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

## Abnahmekriterien

### UX

- Wenn Sie `/auth -> API-Schlüssel -> Benutzerdefinierter API-Schlüssel` auswählen, wird der benutzerdefinierte Assistent anstelle der reinen Dokumentationsseite geöffnet.
- Der erste Schritt des benutzerdefinierten Assistenten fragt nach dem Protokoll.
- Der zweite Schritt fragt nach der Basis-URL und zeigt das ausgewählte Protokoll an.
- Der dritte Schritt fragt nach dem API-Schlüssel und zeigt das ausgewählte Protokoll und den Endpunkt an.
- Der vierte Schritt fragt nach Modell-IDs und zeigt das ausgewählte Protokoll und den Endpunkt an.
- Der Überprüfungsschritt zeigt das generierte JSON an, einschließlich maskiertem API-Schlüssel, ausgewähltem Protokoll und generiertem Umgebungs-Schlüssel.
- Durch Drücken der Eingabetaste im Überprüfungsschritt werden die Einstellungen gespeichert und die Authentifizierung versucht.
- Durch Drücken von Esc wird schrittweise zurück navigiert.

### Einstellungen

- Der API-Schlüssel wird in `settings.json.env[generatedEnvKey]` geschrieben.
- `generatedEnvKey` wird aus dem ausgewählten Protokoll und der `baseUrl` unter Verwendung des Qwen-privaten Namespace abgeleitet.
- `modelProviders[selectedProtocol]` erhält einen Eintrag pro normalisierter Modell-ID.
- Jeder benutzerdefinierte Modelleintrag verwendet `id === name`.
- `security.auth.selectedType` wird auf das ausgewählte Protokoll gesetzt.
- `model.name` wird auf die erste normalisierte Modell-ID gesetzt.
- Vorhandene Einträge unter `modelProviders[selectedProtocol]` mit einem anderen `envKey` bleiben erhalten.
- Vorhandene Einträge unter `modelProviders[selectedProtocol]` mit demselben generierten `envKey` werden ersetzt.
- Einträge unter anderen `modelProviders`-Protokollschlüsseln bleiben erhalten.
### Authentifizierung

- Der generierte Env-Key wird vor der Authentifizierungsaktualisierung mit `process.env` synchronisiert.
- Die App lädt die Konfiguration des Modellanbieters neu, bevor `refreshAuth(selectedProtocol)` aufgerufen wird.
- Erfolgreiche Authentifizierung schließt den Auth-Dialog und zeigt eine Erfolgsmeldung an.
- Fehlgeschlagene Authentifizierung belässt den Benutzer im Auth-Flow und zeigt einen umsetzbaren Fehler an.

### Tests

- Fügen Sie Tests für `AuthDialog` hinzu oder aktualisieren Sie sie, um den benutzerdefinierten Wizard-Pfad abzudecken.
- Fügen Sie Tests für die Protokollauswahl hinzu.
- Fügen Sie Tests für die Env-Key-Generierung aus Protokoll und Basis-URL hinzu.
- Fügen Sie Tests für die Normalisierung und Deduplizierung von Modell-IDs hinzu.
- Fügen Sie Tests für das Zusammenführungsverhalten der Einstellungen hinzu:
  - derselbe generierte Env-Key ersetzt alte benutzerdefinierte Einträge unter demselben Protokoll;
  - unterschiedliche Env-Keys werden beibehalten;
  - andere Protokollschlüssel werden beibehalten;
  - Einträge für Coding Plan und ModelStudio Standard werden beibehalten.
- Fügen Sie nach Möglichkeit Tests für den generierten JSON-Vorschauinhalt hinzu.

## Offene Fragen

1. Soll die API-Key-Eingabe während der Eingabe maskiert werden, oder nur auf dem Überprüfungsbildschirm?
2. Sollten lokale Endpunkte wie `http://localhost:11434/v1` leere oder Platzhalter-API-Keys für Server zulassen, die keine Authentifizierung erfordern?
3. Soll die generierte JSON-Vorschau nur den angewendeten Patch anzeigen, oder den resultierenden vollständigen relevanten Einstellungs-Unterbaum nach der Zusammenführung?
4. Sollte Vertex AI in diesen benutzerdefinierten API-Key-Wizard aufgenommen werden, oder außen vor bleiben, da sich seine Authentifizierungseinrichtung von einfachen API-Key-Anbietern unterscheidet?

Für die erste Version werden folgende Standardeinstellungen empfohlen:

- Unterstützung für `openai`, `anthropic` und `gemini`.
- Verwenden Sie das vorhandene Eingabeverhalten während der Eingabe.
- Erfordern Sie einen nicht-leeren API-Key zur Konsistenz mit API-Key-Authentifizierungsabläufen.
- Zeigen Sie das Patch-Format-JSON an, das gespeichert oder aktualisiert wird.
- Behalten Sie Vertex AI außerhalb des benutzerdefinierten API-Key-Wizards, bis eine separate Produktentscheidung getroffen wird.
