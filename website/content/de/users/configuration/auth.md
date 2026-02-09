# Authentifizierung

Qwen Code unterstützt zwei Authentifizierungsmethoden. Wählen Sie diejenige aus, die zu Ihrer gewünschten CLI-Nutzung passt:

- **Qwen OAuth (empfohlen)**: Anmeldung mit Ihrem `qwen.ai`-Konto im Browser.
- **OpenAI-kompatibles API**: Verwendung eines API-Schlüssels (OpenAI oder beliebiger OpenAI-kompatibler Anbieter / Endpunkt).

![](https://img.alicdn.com/imgextra/i2/O1CN01IxI1bt1sNO543AVTT_!!6000000005754-0-tps-1958-822.jpg)

## Option 1: Qwen OAuth (empfohlen & kostenlos) 👍

Verwenden Sie diese Option, wenn Sie die einfachste Einrichtung wünschen und Qwen-Modelle verwenden.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Anmeldeseite. Nach Abschluss des Vorgangs werden die Anmeldeinformationen lokal zwischengespeichert, sodass Sie normalerweise nicht erneut anmelden müssen.
- **Voraussetzungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Kein API-Schlüssel-Management, automatische Aktualisierung der Anmeldeinformationen.
- **Kosten & Kontingent**: Kostenlos, mit einem Kontingent von **60 Anfragen/Minute** und **1.000 Anfragen/Tag**.

Starten Sie die CLI und folgen Sie dem Browser-Ablauf:

```bash
qwen
```

## Option 2: OpenAI-kompatible API (API-Schlüssel)

Verwenden Sie diese Option, wenn Sie OpenAI-Modelle oder einen beliebigen Anbieter verwenden möchten, der eine OpenAI-kompatible API bereitstellt (z.B. OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian oder ein selbst gehosteter kompatibler Endpunkt).

### Empfohlen: Coding Plan (abonnementbasiert) 🚀

Verwenden Sie dies, wenn Sie vorhersehbare Kosten mit höheren Nutzungskontingenten für das qwen3-coder-plus-Modell wünschen.

> [!IMPORTANT]
>
> Das Coding Plan ist nur für Benutzer im chinesischen Festland (Region Beijing) verfügbar.

- **Funktionsweise**: Abonnieren Sie das Coding Plan mit einem festen monatlichen Betrag und konfigurieren Sie anschließend Qwen Code so, dass es den dedizierten Endpunkt und Ihren Abonnement-API-Schlüssel verwendet.
- **Voraussetzungen**: Ein aktives Coding Plan-Abonnement von [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Vorteile**: Höhere Nutzungskontingente, vorhersehbare monatliche Kosten, Zugriff auf das neueste qwen3-coder-plus-Modell.
- **Kosten und Kontingent**: Variiert je nach Plan (siehe Tabelle unten).

#### Coding Plan Preise & Kontingente

| Funktion            | Lite Basic Plan       | Pro Advanced Plan     |
| :------------------ | :-------------------- | :-------------------- |
| **Preis**           | ¥40/Monat             | ¥200/Monat            |
| **5-Stunden-Limit** | Bis zu 1.200 Anfragen | Bis zu 6.000 Anfragen |
| **Wöchentliches Limit** | Bis zu 9.000 Anfragen | Bis zu 45.000 Anfragen |
| **Monatliches Limit** | Bis zu 18.000 Anfragen | Bis zu 90.000 Anfragen |
| **Unterstütztes Modell** | qwen3-coder-plus      | qwen3-coder-plus      |

#### Schnelle Einrichtung für das Coding Plan

Wenn Sie die OpenAI-kompatible Option in der CLI auswählen, geben Sie diese Werte ein:

- **API-Schlüssel**: `sk-sp-xxxxx`
- **Basis-URL**: `https://coding.dashscope.aliyuncs.com/v1`
- **Modell**: `qwen3-coder-plus`

> **Hinweis**: API-Schlüssel für das Coding Plan haben das Format `sk-sp-xxxxx`, was sich von den Standard-Alibaba-Cloud-API-Schlüsseln unterscheidet.

#### Konfiguration über Umgebungsvariablen

Legen Sie diese Umgebungsvariablen fest, um Coding Plan zu verwenden:

```bash
export OPENAI_API_KEY="your-coding-plan-api-key"  # Format: sk-sp-xxxxx
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Weitere Details zu Coding Plan, einschließlich Abonnementoptionen und Problembehandlung, finden Sie in der [vollständigen Coding Plan-Dokumentation](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

### Andere OpenAI-kompatible Anbieter

Wenn Sie andere Anbieter verwenden (OpenAI, Azure, lokale LLMs usw.), nutzen Sie die folgenden Konfigurationsmethoden.

### Konfiguration über Befehlszeilenargumente

```bash

# Nur API-Schlüssel
qwen-code --openai-api-key "your-api-key-here"

# Benutzerdefinierte Basis-URL (OpenAI-kompatibler Endpunkt)
qwen-code --openai-api-key "your-api-key-here" --openai-base-url "https://your-endpoint.com/v1"

# Benutzerdefiniertes Modell
qwen-code --openai-api-key "your-api-key-here" --model "gpt-4o-mini"
```

### Konfiguration über Umgebungsvariablen

Sie können diese in Ihrem Shell-Profil, in der CI oder in einer `.env`-Datei festlegen:

```bash
export OPENAI_API_KEY="ihre-api-schlüssel-hier"
export OPENAI_BASE_URL="https://api.openai.com/v1"  # optional
export OPENAI_MODEL="gpt-4o"                        # optional
```

#### Persistenz von Umgebungsvariablen mit `.env` / `.qwen/.env`

Qwen Code lädt automatisch Umgebungsvariablen aus der **ersten** `.env`-Datei, die es findet (Variablen werden **nicht** über mehrere Dateien hinweg zusammengeführt).

Suchreihenfolge:

1. Ab dem **aktuellen Verzeichnis**, aufsteigend bis zu `/`:
   1. `.qwen/.env`
   2. `.env`
2. Falls nichts gefunden wird, greift es auf Ihr **Home-Verzeichnis** zurück:
   - `~/.qwen/.env`
   - `~/.env`

`.qwen/.env` wird empfohlen, um Qwen Code-Variablen von anderen Tools zu isolieren. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) sind von Projekt-`.env`-Dateien ausgeschlossen, um eine Beeinträchtigung des qwen-code-Verhaltens zu vermeiden.

Beispiele:

```bash

# Projektspezifische Einstellungen (empfohlen)
```bash
mkdir -p .qwen
cat >> .qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://api-inference.modelscope.cn/v1"
OPENAI_MODEL="Qwen/Qwen3-Coder-480B-A35B-Instruct"
EOF
```

```bash
# Benutzerspezifische Einstellungen (überall verfügbar)
mkdir -p ~/.qwen
cat >> ~/.qwen/.env <<'EOF'
OPENAI_API_KEY="your-api-key"
OPENAI_BASE_URL="https://dashscope.aliyuncs.com/compatible-mode/v1"
OPENAI_MODEL="qwen3-coder-plus"
EOF
```

## Authentifizierungsmethode wechseln (ohne Neustart)

Führen Sie in der Qwen Code-Benutzeroberfläche Folgendes aus:

```bash
/auth
```

## Nicht-interaktive / Headless-Umgebungen (CI, SSH, Container)

In einer nicht-interaktiven Konsole können Sie typischerweise **nicht** den OAuth-Browser-Anmeldevorgang abschließen.
Verwenden Sie die OpenAI-kompatible API-Methode über Umgebungsvariablen:

- Setzen Sie mindestens `OPENAI_API_KEY`.
- Optional können Sie `OPENAI_BASE_URL` und `OPENAI_MODEL` setzen.

Wenn keine dieser Variablen in einer nicht-interaktiven Sitzung gesetzt ist, wird Qwen Code mit einem Fehler beendet.

## Sicherheitshinweise

- Committe keine API-Schlüssel in das Versionskontrollsystem.
- Verwende bevorzugt `.qwen/.env` für projektlokale Geheimnisse (und halte es aus git heraus).
- Behandle die Ausgabe deines Terminals als sensibel, wenn sie Anmeldeinformationen zur Überprüfung ausgibt.