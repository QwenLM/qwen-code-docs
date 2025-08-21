# OpenAI Authentifizierung

Qwen Code CLI unterstützt die OpenAI-Authentifizierung für Nutzer, die OpenAI-Modelle anstelle von Google's Gemini-Modellen verwenden möchten.

## Authentifizierungsmethoden

### 1. Interaktive Authentifizierung (Empfohlen)

Wenn du das CLI zum ersten Mal ausführst und OpenAI als Authentifizierungsmethode auswählst, wirst du aufgefordert, folgende Informationen einzugeben:

- **API Key**: Dein OpenAI API key von [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
- **Base URL**: Die Basis-URL für die OpenAI API (Standardwert: `https://api.openai.com/v1`)
- **Model**: Das zu verwendende OpenAI-Modell (Standardwert: `gpt-4o`)

Das CLI führt dich Schritt für Schritt durch die Eingabe:

1. Gib deinen API key ein und drücke Enter
2. Überprüfe/ändere die Base URL und drücke Enter
3. Überprüfe/ändere den Modellnamen und drücke Enter

**Hinweis**: Du kannst deinen API key direkt einfügen – das CLI unterstützt Paste-Funktionalität und zeigt den vollständigen Key zur Verifikation an.

### 2. Command Line Arguments

Du kannst die OpenAI-Zugangsdaten auch über Command Line Arguments bereitstellen:

```bash

# Grundlegende Verwendung mit API key
qwen-code --openai-api-key "your-api-key-here"

# Mit benutzerdefinierter base URL
qwen-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-custom-endpoint.com/v1"

# Mit benutzerdefiniertem model
qwen-code --openai-api-key "your-api-key-here" --model "gpt-4-turbo"
```

### 3. Environment Variables

Setze die folgenden Environment Variables in deiner Shell oder in der `.env` Datei:

```bash
export OPENAI_API_KEY="your-api-key-here"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # Optional, standardmäßig dieser Wert
export OPENAI_MODEL="gpt-4o"  # Optional, standardmäßig gpt-4o
```

## Unterstützte Models

Die CLI unterstützt alle OpenAI models, die über die OpenAI API verfügbar sind, darunter:

- `gpt-4o` (Standard)
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- Und weitere verfügbare models

## Custom Endpoints

Du kannst custom Endpoints verwenden, indem du die `OPENAI_BASE_URL` Environment Variable setzt oder das `--openai-base-url` Command-Line-Argument verwendest. Das ist nützlich für:

- Azure OpenAI nutzen
- Andere OpenAI-kompatible APIs nutzen
- Lokale OpenAI-kompatible Server nutzen

## Authentifizierungsmethoden wechseln

Um zwischen verschiedenen Authentifizierungsmethoden zu wechseln, verwende den `/auth` Befehl im CLI-Interface.

## Sicherheitshinweise

- API Keys werden während der Session im Speicher gehalten
- Für persistente Speicherung solltest du Environment Variables oder `.env` Files nutzen
- Commite niemals API Keys in die Versionskontrolle
- Die CLI zeigt API Keys im Klartext zur Verifikation an – stelle sicher, dass dein Terminal sicher ist