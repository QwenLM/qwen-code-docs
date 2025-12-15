# Authentifizierung

Qwen Code unterstützt zwei Authentifizierungsmethoden. Wähle diejenige aus, die deiner Verwendung der CLI entspricht:

- **Qwen OAuth (empfohlen)**: Anmeldung mit deinem `qwen.ai`-Konto über einen Browser.
- **OpenAI-kompatible API**: Verwendung eines API-Schlüssels (OpenAI oder ein beliebiger OpenAI-kompatibler Anbieter / Endpunkt).

## Option 1: Qwen OAuth (empfohlen & kostenlos) 👍

Verwende diese Methode, wenn du eine möglichst einfache Einrichtung wünschst und Qwen-Modelle verwendest.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Anmeldeseite. Nach Abschluss werden die Anmeldeinformationen lokal zwischengespeichert, sodass du dich normalerweise nicht erneut anmelden musst.
- **Voraussetzungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Kein Management von API-Schlüsseln, automatische Aktualisierung der Anmeldeinformationen.
- **Kosten & Kontingent**: Kostenlos, mit einem Kontingent von **60 Anfragen/Minute** und **2.000 Anfragen/Tag**.

Starte die CLI und folge dem Browser-Ablauf:

```bash
qwen
```

## Option 2: OpenAI-kompatible API (API-Schlüssel)

Verwenden Sie diese Option, wenn Sie OpenAI-Modelle oder einen Anbieter nutzen möchten, der eine OpenAI-kompatible API bereitstellt (z. B. OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian oder einen selbst gehosteten kompatiblen Endpunkt).

### Schnellstart (interaktiv, empfohlen für die lokale Verwendung)

Wenn Sie in der CLI die OpenAI-kompatible Option auswählen, werden Sie zur Eingabe aufgefordert von:

- **API-Schlüssel**
- **Basis-URL** (Standard: `https://api.openai.com/v1`)
- **Modell** (Standard: `gpt-4o`)

> **Hinweis:** Die CLI zeigt den Schlüssel möglicherweise im Klartext zur Überprüfung an. Stellen Sie sicher, dass Ihr Terminal nicht aufgezeichnet oder geteilt wird.

### Konfiguration über Kommandozeilenargumente

```bash

# Nur API-Schlüssel
qwen-code --openai-api-key "ihr-api-schluessel-hier"

# Benutzerdefinierte Basis-URL (OpenAI-kompatibler Endpunkt)
qwen-code --openai-api-key "ihr-api-schluessel-hier" --openai-base-url "https://ihr-endpunkt.com/v1"

# Benutzerdefiniertes Modell
qwen-code --openai-api-key "ihr-api-schluessel-hier" --model "gpt-4o-mini"
```

### Konfiguration über Umgebungsvariablen

Du kannst diese in deinem Shell-Profil, in deiner CI-Umgebung oder in einer `.env`-Datei festlegen:

```bash
export OPENAI_API_KEY="dein-api-schluessel-hier"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # optional
export OPENAI_MODEL="gpt-4o"                        # optional
```

#### Dauerhafte Speicherung von Umgebungsvariablen mit `.env` / `.qwen/.env`

Qwen Code lädt automatisch Umgebungsvariablen aus der **ersten** gefundenen `.env`-Datei (Variablen werden **nicht** aus mehreren Dateien zusammengeführt).

Suchreihenfolge:

1. Vom **aktuellen Verzeichnis** ausgehend, aufwärts bis zu `/`:
   1. `.qwen/.env`
   2. `.env`
2. Wenn nichts gefunden wird, greift es auf dein **Home-Verzeichnis** zurück:
   - `~/.qwen/.env`
   - `~/.env`

Die Verwendung von `.qwen/.env` wird empfohlen, um die Qwen Code-Variablen von anderen Tools zu isolieren. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) sind von projektbezogenen `.env`-Dateien ausgeschlossen, um das Verhalten von qwen-code nicht zu beeinträchtigen.

Beispiele:

```bash

# Projektspezifische Einstellungen (empfohlen)
```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="dein-api-schlüssel"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

```bash
# Benutzerweite Einstellungen (überall verfügbar)
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="dein-api-schlüssel"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Authentifizierungsmethode wechseln (ohne Neustart)

Führe im Qwen Code UI aus:

```bash
/auth
```

## Nicht-interaktive / kopflose Umgebungen (CI, SSH, Container)

In einem nicht-interaktiven Terminal kannst du typischerweise **nicht** den OAuth-Browser-Anmeldevorgang abschließen.
Verwende stattdessen die OpenAI-kompatible API-Methode über Umgebungsvariablen:

- Setze mindestens `OPENAI_API_KEY`.
- Optional kannst du auch `OPENAI_BASE_URL` und `OPENAI_MODEL` setzen.

Wenn keine dieser Variablen in einer nicht-interaktiven Sitzung gesetzt ist, wird Qwen Code mit einem Fehler beendet.

## Sicherheitshinweise

- Committen Sie keine API-Schlüssel in die Versionskontrolle.
- Verwenden Sie vorzugsweise `.qwen/.env` für projektspezifische Geheimnisse (und schließen Sie diese Datei von Git aus).
- Behandeln Sie Ihre Terminalausgabe als sensibel, wenn sie zur Überprüfung Zugangsdaten anzeigt.