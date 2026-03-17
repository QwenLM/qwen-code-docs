# Authentifizierung

Qwen Code unterstützt drei Authentifizierungsmethoden. Wählen Sie diejenige aus, die am besten zu Ihrer gewünschten CLI-Nutzung passt:

- **Qwen OAuth**: Melden Sie sich mit Ihrem `qwen.ai`-Konto in einem Browser an. Kostenlos mit täglichem Kontingent.
- **Alibaba Cloud Coding-Plan**: Verwenden Sie einen API-Schlüssel von Alibaba Cloud. Bezahltes Abonnement mit vielfältigen Modell-Optionen und höheren Kontingenten.
- **API-Schlüssel**: Verwenden Sie Ihren eigenen API-Schlüssel. Flexibel nach Ihren individuellen Anforderungen – unterstützt OpenAI, Anthropic, Gemini und andere kompatible Endpunkte.

## Option 1: Qwen-OAuth (kostenlos)

Verwenden Sie diese Methode, wenn Sie die einfachste Einrichtung wünschen und Qwen-Modelle nutzen.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Anmeldeseite. Nach Abschluss des Anmeldevorgangs werden Ihre Anmeldedaten lokal zwischengespeichert, sodass Sie sich in der Regel nicht erneut anmelden müssen.
- **Voraussetzungen**: Ein `qwen.ai`-Konto sowie Internetzugang (mindestens für die erste Anmeldung).
- **Vorteile**: Kein manuelles Management von API-Schlüsseln, automatische Aktualisierung der Anmeldedaten.
- **Kosten & Kontingent**: Kostenlos mit einem Kontingent von **60 Anfragen/Minute** und **1.000 Anfragen/Tag**.

Starten Sie die CLI und folgen Sie dem Browser-Workflow:

```bash
qwen
```

> [!note]
>
> In nicht-interaktiven oder headless-Umgebungen (z. B. CI, SSH, Container) können Sie den OAuth-Browser-Anmeldevorgang in der Regel **nicht** abschließen.  
> Verwenden Sie in diesen Fällen bitte den Alibaba Cloud Coding Plan oder die Authentifizierung über einen API-Schlüssel.

## 💳 Option 2: Alibaba Cloud-Coding-Plan

Wählen Sie diese Option, wenn Sie vorhersehbare Kosten, eine breite Auswahl an Modellen und höhere Nutzungsquoten wünschen.

- **Funktionsweise**: Abonnieren Sie das Coding-Plan mit einer festen monatlichen Gebühr und konfigurieren Sie anschließend Qwen Code für die Nutzung des dedizierten Endpunkts sowie Ihres Abonnement-API-Schlüssels.
- **Voraussetzungen**: Erwerben Sie ein aktives Coding-Plan-Abonnement über [Aliyun Bailian](https://bailian.console.aliyun.com/?tab=model#/efm/coding_plan) oder [Alibaba Cloud](https://bailian.console.alibabacloud.com/?tab=model#/efm/coding_plan), je nach Region Ihres Kontos.
- **Vorteile**: Breite Modellauswahl, höhere Nutzungsquoten, vorhersehbare monatliche Kosten sowie Zugriff auf eine große Bandbreite an Modellen (Qwen, GLM, Kimi, Minimax u. a.).
- **Kosten & Quoten**: Siehe [Dokumentation zum Aliyun Bailian-Coding-Plan](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

Das Alibaba Cloud-Coding-Plan ist in zwei Regionen verfügbar:

| Region                           | Konsole-URL                                                                  |
| -------------------------------- | ---------------------------------------------------------------------------- |
| Aliyun Bailian (aliyun.com)      | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (alibabacloud.com) | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Interaktive Einrichtung

Geben Sie `qwen` im Terminal ein, um Qwen Code zu starten, führen Sie dann den Befehl `/auth` aus und wählen Sie **Alibaba Cloud Coding Plan**. Wählen Sie Ihre Region aus und geben Sie Ihren Schlüssel `sk-sp-xxxxxxxxx` ein.

Nach der Authentifizierung verwenden Sie den Befehl `/model`, um zwischen allen von Alibaba Cloud Coding Plan unterstützten Modellen zu wechseln (darunter `qwen3.5-plus`, `qwen3-coder-plus`, `qwen3-coder-next`, `qwen3-max`, `glm-4.7` und `kimi-k2.5`).

### Alternative: Konfiguration über `settings.json`

Falls Sie den interaktiven `/auth`-Ablauf überspringen möchten, fügen Sie Folgendes zu `~/.qwen/settings.json` hinzu:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus aus dem Alibaba Cloud Coding Plan",
        "envKey": "BAILIAN_CODING_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_CODING_PLAN_API_KEY": "sk-sp-xxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

> [!note]
>
> Der Coding Plan verwendet einen dedizierten Endpunkt (`https://coding.dashscope.aliyuncs.com/v1`), der sich vom Standard-Dashscope-Endpunkt unterscheidet. Stellen Sie sicher, dass Sie die richtige `baseUrl` verwenden.

## 🚀 Option 3: API-Schlüssel (flexibel)

Verwenden Sie diese Option, wenn Sie eine Verbindung zu externen Anbietern wie OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope oder einem selbst gehosteten Endpunkt herstellen möchten. Unterstützt mehrere Protokolle und Anbieter.

### Empfohlen: Ein-Datei-Setup über `settings.json`

Der einfachste Einstieg in die API-Schlüssel-Authentifizierung besteht darin, alle Einstellungen in einer einzigen Datei `~/.qwen/settings.json` zu speichern. Hier ist ein vollständiges, sofort einsatzbereites Beispiel:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder über Dashscope",
        "envKey": "DASHSCOPE_API_KEY"
      }
    ]
  },
  "env": {
    "DASHSCOPE_API_KEY": "sk-xxxxxxxxxxxxx"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3-coder-plus"
  }
}
```

Funktion der einzelnen Felder:

| Feld                         | Beschreibung                                                                                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Deklariert, welche Modelle verfügbar sind und wie eine Verbindung zu ihnen hergestellt wird. Die Schlüssel (`openai`, `anthropic`, `gemini`) repräsentieren das jeweilige API-Protokoll. |
| `env`                        | Speichert API-Schlüssel direkt in `settings.json` als Fallback (niedrigste Priorität – Shell-`export` und `.env`-Dateien haben Vorrang).     |
| `security.auth.selectedType` | Teilt Qwen Code mit, welches Protokoll beim Start verwendet werden soll (z. B. `openai`, `anthropic`, `gemini`). Ohne diesen Eintrag müssten Sie `/auth` interaktiv ausführen. |
| `model.name`                 | Das Standardmodell, das bei Start von Qwen Code aktiviert wird. Muss mit einem der `id`-Werte in Ihrem `modelProviders`-Abschnitt übereinstimmen. |

Nachdem Sie die Datei gespeichert haben, führen Sie einfach `qwen` aus – eine interaktive `/auth`-Einrichtung ist nicht erforderlich.

> [!tip]
>
> Die folgenden Abschnitte erläutern jeden Teil detaillierter. Falls das obige Schnellbeispiel für Sie funktioniert, können Sie gerne direkt zu den [Sicherheitshinweisen](#security-notes) springen.

Das zentrale Konzept sind **Modellanbieter** (`modelProviders`): Qwen Code unterstützt mehrere API-Protokolle, nicht nur OpenAI. Sie konfigurieren verfügbare Anbieter und Modelle durch Bearbeitung von `~/.qwen/settings.json` und wechseln zur Laufzeit mit dem Befehl `/model` zwischen ihnen.

#### Unterstützte Protokolle

| Protokoll             | Schlüssel in `modelProviders` | Umgebungsvariablen                                           | Anbieter                                                                                     |
| --------------------- | ----------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel     | `openai`                      | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`        | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, beliebige OpenAI-kompatible Endpunkte |
| Anthropic             | `anthropic`                   | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                              |
| Google GenAI          | `gemini`                      | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                 |

#### Schritt 1: Konfigurieren Sie Modelle und Anbieter in `~/.qwen/settings.json`

Definieren Sie, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modelleintrag erfordert mindestens eine `id` und eine `envKey` (der Name der Umgebungsvariablen, die Ihren API-Schlüssel enthält).

> [!important]
>
> Es wird empfohlen, `modelProviders` im benutzerspezifischen `~/.qwen/settings.json` zu definieren, um Merge-Konflikte zwischen Projekteinstellungen und Benutzereinstellungen zu vermeiden.

Bearbeiten Sie `~/.qwen/settings.json` (erstellen Sie die Datei ggf. neu). Sie können mehrere Protokolle in einer einzigen Datei kombinieren – hier ist ein Beispiel mit mehreren Anbietern, das ausschließlich den Abschnitt `modelProviders` zeigt:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "gpt-4o",
        "name": "GPT-4o",
        "envKey": "OPENAI_API_KEY",
        "baseUrl": "https://api.openai.com/v1"
      }
    ],
    "anthropic": [
      {
        "id": "claude-sonnet-4-20250514",
        "name": "Claude Sonnet 4",
        "envKey": "ANTHROPIC_API_KEY"
      }
    ],
    "gemini": [
      {
        "id": "gemini-2.5-pro",
        "name": "Gemini 2.5 Pro",
        "envKey": "GEMINI_API_KEY"
      }
    ]
  }
}
```

> [!tip]
>
> Vergessen Sie nicht, zusätzlich zu `modelProviders` auch `env`, `security.auth.selectedType` und `model.name` festzulegen – als Referenz dient das [vollständige Beispiel oben](#recommended-one-file-setup-via-settingsjson).

**Felder von `ModelConfig` (jeder Eintrag innerhalb von `modelProviders`):**

| Feld               | Erforderlich | Beschreibung                                                                 |
| ------------------ | ------------ | ---------------------------------------------------------------------------- |
| `id`               | Ja           | Modell-ID, die an die API gesendet wird (z. B. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Nein         | Anzeigename im `/model`-Auswahlfeld (Standardwert ist `id`)                 |
| `envKey`           | Ja           | Name der Umgebungsvariablen für den API-Schlüssel (z. B. `OPENAI_API_KEY`) |
| `baseUrl`          | Nein         | Überschreibung des API-Endpunkts (nützlich bei Proxies oder benutzerdefinierten Endpunkten) |
| `generationConfig` | Nein         | Feinabstimmung von `timeout`, `maxRetries`, `samplingParams` usw.           |

> [!note]
>
> Wenn Sie das Feld `env` in `settings.json` verwenden, werden Anmeldeinformationen im Klartext gespeichert. Für bessere Sicherheit bevorzugen Sie stattdessen `.env`-Dateien oder Shell-`export`-Anweisungen – siehe [Schritt 2](#step-2-set-environment-variables).

Für das vollständige Schema von `modelProviders` sowie erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` siehe [Referenz zu Modellanbietern](model-providers.md).

#### Schritt 2: Umgebungsvariablen festlegen

Qwen Code liest API-Schlüssel aus Umgebungsvariablen (angegeben durch `envKey` in Ihrer Modellkonfiguration) ein. Es gibt mehrere Möglichkeiten, diese bereitzustellen – im Folgenden aufgelistet von **höchster bis niedrigster Priorität**:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Festlegen direkt in Ihrer Shell-Profil-Datei (`~/.zshrc`, `~/.bashrc`, etc.) oder inline vor dem Start:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-kompatibel
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."

# Google GenAI
export GEMINI_API_KEY="AIza..."
```

**2. `.env`-Dateien**

Qwen Code lädt automatisch die **erste** `.env`-Datei, die es findet (Variablen werden **nicht** aus mehreren Dateien zusammengeführt). Es werden nur Variablen geladen, die noch nicht in `process.env` vorhanden sind.

Suchreihenfolge (ausgehend vom aktuellen Verzeichnis, aufwärts bis `/`):

1. `.qwen/.env` (bevorzugt – isoliert Qwen-Code-Variablen von anderen Tools)
2. `.env`

Wird keine Datei gefunden, wird als Fallback das **Home-Verzeichnis** verwendet:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` wird gegenüber `.env` empfohlen, um Konflikte mit anderen Tools zu vermeiden. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) werden aus projektbezogenen `.env`-Dateien ausgeschlossen, um das Verhalten von Qwen Code nicht zu beeinträchtigen.

**3. `settings.json` → `env`-Feld (niedrigste Priorität)**

Sie können API-Schlüssel auch direkt in `~/.qwen/settings.json` unter dem Schlüssel `env` definieren. Diese werden als **Fallback mit niedrigster Priorität** geladen – sie greifen nur, wenn eine Variable weder durch die Systemumgebung noch durch `.env`-Dateien bereits gesetzt wurde.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Dies ist der Ansatz, der im obigen [Beispiel für die Ein-Datei-Einrichtung](#empfohlene-ein-datei-einrichtung-via-settingsjson) verwendet wird. Er bietet den Vorteil, alle Einstellungen an einem Ort zu halten; beachten Sie jedoch, dass `settings.json` möglicherweise gemeinsam genutzt oder synchronisiert wird – für sensible Geheimnisse bevorzugen Sie `.env`-Dateien.

**Zusammenfassung der Prioritäten:**

| Priorität   | Quelle                              | Überschreibungsverhalten                                          |
| ----------- | ----------------------------------- | ----------------------------------------------------------------- |
| 1 (höchste) | CLI-Flags (`--openai-api-key`)      | Hat immer Vorrang                                                 |
| 2           | Systemumgebung (`export`, inline)   | Überschreibt `.env` und `settings.json` → `env`                   |
| 3           | `.env`-Datei                        | Setzt Variablen nur, falls sie nicht bereits in der Systemumgebung vorhanden sind |
| 4 (niedrigste) | `settings.json` → `env`          | Setzt Variablen nur, falls sie weder in der Systemumgebung noch in `.env` vorhanden sind |

#### Schritt 3: Modelle mit `/model` wechseln

Nach dem Start von Qwen Code verwenden Sie den Befehl `/model`, um zwischen allen konfigurierten Modellen zu wechseln. Die Modelle sind nach Protokoll gruppiert:

```
/model
```

Der Auswahldialog zeigt alle Modelle aus Ihrer `modelProviders`-Konfiguration an, gruppiert nach ihrem Protokoll (z. B. `openai`, `anthropic`, `gemini`). Ihre Auswahl bleibt über Sitzungen hinweg erhalten.

Sie können Modelle auch direkt über ein Kommandozeilenargument wechseln – praktisch, wenn Sie mit mehreren Terminals arbeiten.

```bash

# In einem Terminal

qwen --model "qwen3-coder-plus"

# In einem anderen Terminal

qwen --model "qwen3.5-plus"
```

## Sicherheitshinweise

- Übertragen Sie keine API-Schlüssel in Versionskontrollsysteme.
- Verwenden Sie vorzugsweise `.qwen/.env` für projektspezifische Geheimnisse (und stellen Sie sicher, dass diese Datei nicht in Git landet).
- Behandeln Sie die Ausgabe Ihres Terminals als vertraulich, falls darin Anmeldeinformationen zur Überprüfung angezeigt werden.