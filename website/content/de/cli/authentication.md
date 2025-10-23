# Authentifizierung einrichten

Qwen Code unterstützt zwei Hauptmethoden zur Authentifizierung für den Zugriff auf KI-Modelle. Wähle die Methode, die am besten zu deinem Anwendungsfall passt:

1.  **Qwen OAuth (empfohlen):**
    - Verwende diese Option, um dich mit deinem qwen.ai-Konto anzumelden.
    - Beim ersten Start leitet Qwen Code dich zur Authentifizierungsseite von qwen.ai weiter. Nach erfolgreicher Authentifizierung werden deine Zugangsdaten lokal zwischengespeichert, sodass du bei zukünftigen Starts den Web-Login überspringen kannst.
    - **Voraussetzungen:**
      - Gültiges qwen.ai-Konto
      - Internetverbindung für die initiale Authentifizierung
    - **Vorteile:**
      - Nahtloser Zugriff auf Qwen-Modelle
      - Automatische Aktualisierung der Zugangsdaten
      - Keine manuelle Verwaltung von API Keys erforderlich

    **Erste Schritte:**

    ```bash
    # Starte Qwen Code und folge dem OAuth-Ablauf
    qwen
    ```

    Die CLI öffnet automatisch deinen Browser und führt dich durch den Authentifizierungsprozess.

    **Für Nutzer, die sich über ihr qwen.ai-Konto authentifizieren:**

    **Quota:**
    - 60 Requests pro Minute
    - 2.000 Requests pro Tag
    - Token-Nutzung ist nicht relevant

    **Kosten:** Kostenlos

    **Hinweis:** Es ist keine spezifische Quota für verschiedene Modelle festgelegt; es kann zu einem Fallback auf andere Modelle kommen, um die Qualität des gemeinsamen Nutzungserlebnisses zu gewährleisten.

2.  **<a id="openai-api"></a>OpenAI-kompatible API:**
    - Verwende API Keys von OpenAI oder anderen kompatiblen Anbietern.
    - Diese Methode ermöglicht den Zugriff auf verschiedene KI-Modelle über API Keys.

    **Konfigurationsmöglichkeiten:**

    a) **Umgebungsvariablen:**

    ```bash
    export OPENAI_API_KEY="your_api_key_here"
    export OPENAI_BASE_URL="your_api_endpoint"  # Optional
    export OPENAI_MODEL="your_model_choice"     # Optional
    ```

    b) **Projektweite `.env`-Datei:**
    Erstelle eine `.env`-Datei im Root-Verzeichnis deines Projekts:

    ```env
    OPENAI_API_KEY=your_api_key_here
    OPENAI_BASE_URL=your_api_endpoint
    OPENAI_MODEL=your_model_choice
    ```

    **Unterstützte Provider:**
    - OpenAI (https://platform.openai.com/api-keys)
    - Alibaba Cloud Bailian
    - ModelScope
    - OpenRouter
    - Azure OpenAI
    - Jede OpenAI-kompatible API

## Wechseln der Authentifizierungsmethoden

Um während einer Sitzung zwischen verschiedenen Authentifizierungsmethoden zu wechseln, verwende den Befehl `/auth` im CLI-Interface:

```bash

# Innerhalb der CLI, tippe:
/auth
```

Dadurch kannst du deine Authentifizierungsmethode neu konfigurieren, ohne die Anwendung neu starten zu müssen.

### Umgebungsvariablen mit `.env`-Dateien persistieren

Du kannst eine **`.qwen/.env`**-Datei in deinem Projektverzeichnis oder in deinem Home-Verzeichnis erstellen. Eine einfache **`.env`**-Datei funktioniert ebenfalls, aber `.qwen/.env` wird empfohlen, um die Qwen Code-Variablen von anderen Tools zu isolieren.

**Wichtig:** Einige Umgebungsvariablen (wie `DEBUG` und `DEBUG_MODE`) werden automatisch aus projektweiten `.env`-Dateien ausgeschlossen, um Störungen im Verhalten von qwen-code zu vermeiden. Verwende `.qwen/.env`-Dateien für qwen-code-spezifische Variablen.

Qwen Code lädt automatisch Umgebungsvariablen aus der **ersten** gefundenen `.env`-Datei, wobei folgende Suchreihenfolge verwendet wird:

1. Beginnend im **aktuellen Verzeichnis** und aufwärts Richtung `/`, prüft es in jedem Verzeichnis:
   1. `.qwen/.env`
   2. `.env`
2. Falls keine Datei gefunden wird, greift es auf dein **Home-Verzeichnis** zurück:
   - `~/.qwen/.env`
   - `~/.env`

> **Wichtig:** Die Suche stoppt bei der **ersten** gefundenen Datei – Variablen werden **nicht** aus mehreren Dateien zusammengeführt.

#### Beispiele

**Projektspezifische Überschreibungen** (haben Vorrang, wenn du dich im Projektverzeichnis befindest):

```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

**Benutzerweite Einstellungen** (in jedem Verzeichnis verfügbar):

```bash
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Nicht-interaktiver Modus / Headless-Umgebungen

Wenn du Qwen Code in einer nicht-interaktiven Umgebung ausführst, kannst du den OAuth-Login-Flow nicht verwenden.  
Stattdessen musst du die Authentifizierung mithilfe von Umgebungsvariablen konfigurieren.

Die CLI erkennt automatisch, ob sie in einem nicht-interaktiven Terminal läuft, und verwendet dann – sofern konfiguriert –  
die OpenAI-kompatible API-Methode:

1.  **OpenAI-kompatible API:**
    - Setze die Umgebungsvariable `OPENAI_API_KEY`.
    - Optional kannst du `OPENAI_BASE_URL` und `OPENAI_MODEL` für benutzerdefinierte Endpunkte setzen.
    - Die CLI verwendet diese Zugangsdaten, um sich beim API-Anbieter zu authentifizieren.

**Beispiel für Headless-Umgebungen:**

Wenn keine dieser Umgebungsvariablen in einer nicht-interaktiven Sitzung gesetzt ist, wird die CLI mit einem Fehler beendet.

Eine umfassende Anleitung zur programmatischen Nutzung von Qwen Code sowie zur Integration in  
Automatisierungsworkflows findest du im [Headless Mode Guide](../headless.md).