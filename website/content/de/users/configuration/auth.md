# Authentifizierung

Das `/auth`-Menü von Qwen Code bietet beim ersten Start drei Optionen auf oberster Ebene. Wählen Sie diejenige aus, die zu Ihrer gewünschten CLI-Nutzung passt:

- **Alibaba ModelStudio**: Offizielle empfohlene Einrichtung. Öffnet ein Untermenü mit **Coding Plan** (für einzelne Entwickler · wöchentliches Kontingent inklusive), **Token Plan** (für Teams und Unternehmen · nutzungsbasierte Abrechnung mit dediziertem Endpunkt) oder **Standard-API-Schlüssel** (Verbindung mit einem vorhandenen ModelStudio-API-Schlüssel).
- **Drittanbieter**: Wählen Sie einen integrierten Anbieter und stellen Sie eine Verbindung mit einem API-Schlüssel her (DeepSeek, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Eigener Anbieter**: Manuelle Verbindung zu einem lokalen Server, Proxy oder nicht unterstützten Anbieter – unterstützt OpenAI, Anthropic, Gemini und andere kompatible Endpunkte.

> [!note]
>
> **Qwen OAuth** ist kein auswählbarer Dialogeintrag mehr – der kostenlose Tarif wurde am 15.04.2026 eingestellt. Es wird unten nur noch als fest codierter, eingestellter Anbieter dokumentiert.

## Option 1: Qwen OAuth (Eingestellt)

> [!warning]
>
> Der kostenlose Tarif von Qwen OAuth wurde am 15.04.2026 eingestellt. Vorhandene zwischengespeicherte Token funktionieren möglicherweise noch kurzzeitig, neue Anfragen werden jedoch abgelehnt. Bitte wechseln Sie zum Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) oder einem anderen Anbieter. Führen Sie `qwen` aus und verwenden Sie `/auth` zur Konfiguration.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Login-Seite. Nach Abschluss werden die Anmeldedaten lokal zwischengespeichert, sodass Sie sich in der Regel nicht erneut anmelden müssen.
- **Voraussetzungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Keine Verwaltung von API-Schlüsseln, automatische Aktualisierung der Anmeldedaten.
- **Kosten & Kontingent**: Der kostenlose Tarif wurde am 15.04.2026 eingestellt.

Starten Sie die CLI und folgen Sie dem Browserablauf:

```bash
qwen
```

Qwen OAuth wird nicht mehr als auswählbarer Eintrag im `/auth`-Dialog angeboten; führen Sie `/auth` aus und wählen Sie eine der aktuellen Optionen (Alibaba ModelStudio, Drittanbieter oder Eigener Anbieter).

> [!note]
>
> In nicht-interaktiven oder headless-Umgebungen (z. B. CI, SSH, Container) können Sie den OAuth-Browser-Login in der Regel **nicht** abschließen.
> Verwenden Sie in diesen Fällen bitte die Alibaba Cloud Coding Plan- oder API-Key-Authentifizierungsmethode.

## 💳 Option 2: Alibaba Cloud Coding Plan

Verwenden Sie diese Option, wenn Sie vorhersehbare Kosten mit verschiedenen Modelloptionen und höhere Nutzungskontingente wünschen.

- **Funktionsweise**: Abonnieren Sie den Coding Plan mit einer festen monatlichen Gebühr und konfigurieren Sie Qwen Code dann mit dem dedizierten Endpunkt und Ihrem Abonnement-API-Schlüssel.
- **Voraussetzungen**: Besorgen Sie ein aktives Coding Plan-Abonnement über [Alibaba Cloud ModelStudio (Peking)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) oder [Alibaba Cloud ModelStudio (intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), je nach Region Ihres Kontos.
- **Vorteile**: Verschiedene Modelloptionen, höhere Nutzungskontingente, vorhersehbare monatliche Kosten, Zugriff auf eine breite Palette von Modellen (Qwen, GLM, Kimi, Minimax und mehr).
- **Kosten & Kontingent**: Dokumentation zum Aliyun ModelStudio Coding Plan einsehen [Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

| Region                       | Konsolen-URL                                                               |
| ---------------------------- | -------------------------------------------------------------------------- |
| Aliyun ModelStudio (Peking)  | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)           |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Interaktive Einrichtung

Geben Sie `qwen` im Terminal ein, um Qwen Code zu starten, führen Sie dann den Befehl `/auth` aus, wählen Sie **Alibaba ModelStudio** und anschließend **Coding Plan** aus dem Untermenü. Wählen Sie Ihre Region und geben Sie dann Ihren Schlüssel `sk-sp-xxxxxxxxx` ein.

Nach der Authentifizierung können Sie mit dem Befehl `/model` zwischen allen unterstützten Modellen des Alibaba Cloud Coding Plans wechseln (einschließlich qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 und MiniMax-M2.5).

### Headless- oder Skript-Einrichtung

Für CI, Container oder Skripte konfigurieren Sie den Coding Plan mit Umgebungsvariablen oder `settings.json` anstelle des entfernten Befehls `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Verwenden Sie `https://coding.dashscope.aliyuncs.com/v1` für den China-Peking-Endpunkt oder `https://coding-intl.dashscope.aliyuncs.com/v1` für den internationalen Endpunkt.

### Alternative: Konfiguration über `settings.json`

Wenn Sie den interaktiven `/auth`-Ablauf überspringen möchten, fügen Sie Folgendes zu `~/.qwen/settings.json` hinzu:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus (Coding Plan)",
          "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
          "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
          "envKey": "BAILIAN_CODING_PLAN_API_KEY"
        }
      ]
    }
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
> Der Coding Plan verwendet einen dedizierten Endpunkt (`https://coding.dashscope.aliyuncs.com/v1`), der sich vom Standard-Dashscope-Endpunkt unterscheidet. Achte darauf, die korrekte `baseUrl` zu verwenden.

## 🚀 Option 3: API-Schlüssel (flexibel)

Verwende diese Option, wenn du eine Verbindung zu Drittanbietern wie OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope oder einem selbst gehosteten Endpunkt herstellen möchtest. Unterstützt mehrere Protokolle und Anbieter.

### Empfohlen: Ein-Datei-Setup via `settings.json`

Der einfachste Weg, mit der API-Schlüssel-Authentifizierung zu beginnen, besteht darin, alles in einer einzigen Datei `~/.qwen/settings.json` zu speichern. Hier ist ein vollständiges, einsatzbereites Beispiel:

```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "qwen3-coder-plus",
          "name": "qwen3-coder-plus",
          "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
          "description": "Qwen3-Coder via Dashscope",
          "envKey": "DASHSCOPE_API_KEY"
        }
      ]
    }
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

Was jedes Feld bewirkt:

| Feld                           | Beschreibung                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`               | Deklariert, welche Modelle verfügbar sind und wie man sich mit ihnen verbindet. Die Schlüssel (`openai`, `anthropic`, `gemini`) repräsentieren das API-Protokoll.   |
| `env`                          | Speichert API-Schlüssel direkt in `settings.json` als Fallback (niedrigste Priorität — Shell-`export`- und `.env`-Dateien haben Vorrang).                            |
| `security.auth.selectedType`   | Teilt Qwen Code mit, welches Protokoll beim Start verwendet werden soll (z. B. `openai`, `anthropic`, `gemini`). Ohne dies müsstest du `/auth` interaktiv ausführen. |
| `model.name`                   | Das Standardmodell, das beim Start von Qwen Code aktiviert wird. Muss mit einem der `id`-Werte in deinen `modelProviders` übereinstimmen.                            |

Nach dem Speichern der Datei reicht es aus, `qwen` auszuführen — kein interaktives `/auth`-Setup erforderlich.

> [!tip]
>
> Die folgenden Abschnitte erklären jeden Teil genauer. Wenn das obige Kurzbeispiel für dich funktioniert, kannst du direkt zu [Sicherheitshinweise](#security-notes) springen.

Das Schlüsselkonzept sind **Model Providers** (`modelProviders`): Qwen Code unterstützt mehrere API-Protokolle, nicht nur OpenAI. Du konfigurierst, welche Anbieter und Modelle verfügbar sind, indem du `~/.qwen/settings.json` bearbeitest, und wechselst dann zur Laufzeit mit dem Befehl `/model` zwischen ihnen.

#### Unterstützte Protokolle

| Protokoll           | `modelProviders`-Schlüssel | Umgebungsvariablen                                                                                          | Anbieter                                                                                              |
| ------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel   | `openai`                   | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                                                        | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, jeder OpenAI-kompatible Endpunkt |
| Anthropic           | `anthropic`                | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                               | Anthropic Claude                                                                                      |
| Google GenAI        | `gemini`                   | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                           | Google Gemini                                                                                         |
| Vertex AI           | `vertex-ai`                | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (setzt `GOOGLE_GENAI_USE_VERTEXAI=true`; verwendet das `gemini`-Protokoll) | Google Vertex AI                                                                                      |

#### Schritt 1: Modelle und Anbieter in `~/.qwen/settings.json` konfigurieren

Definiere, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modelleintrag benötigt mindestens eine `id`; `envKey` (der Name der Umgebungsvariablen, die deinen API-Schlüssel enthält) ist optional und empfohlen — wenn er fehlt, wird auf den Standard-Env-Key des Authentifizierungstyps zurückgegriffen (z. B. `OPENAI_API_KEY` für `openai`).

> [!important]
>
> Es wird empfohlen, `modelProviders` in der benutzerspezifischen `~/.qwen/settings.json` zu definieren, um Merge-Konflikte zwischen Projekt- und Benutzereinstellungen zu vermeiden.

Bearbeite `~/.qwen/settings.json` (erstelle sie, falls sie nicht existiert). Du kannst mehrere Protokolle in einer einzigen Datei mischen — hier ist ein Multi-Provider-Beispiel, das nur den `modelProviders`-Abschnitt zeigt:
```json
{
  "modelProviders": {
    "openai": {
      "protocol": "openai",
      "models": [
        {
          "id": "gpt-4o",
          "name": "GPT-4o",
          "envKey": "OPENAI_API_KEY",
          "baseUrl": "https://api.openai.com/v1"
        }
      ]
    },
    "anthropic": {
      "protocol": "anthropic",
      "models": [
        {
          "id": "claude-sonnet-4-20250514",
          "name": "Claude Sonnet 4",
          "envKey": "ANTHROPIC_API_KEY"
        }
      ]
    },
    "gemini": {
      "protocol": "gemini",
      "models": [
        {
          "id": "gemini-2.5-pro",
          "name": "Gemini 2.5 Pro",
          "envKey": "GEMINI_API_KEY"
        }
      ]
    }
  }
}
```

> [!tip]
>
> Vergiss nicht, zusätzlich zu `modelProviders` auch `env`, `security.auth.selectedType` und `model.name` zu setzen – siehe das [vollständige Beispiel oben](#recommended-one-file-setup-via-settingsjson).

**`ModelConfig`-Felder (jeder Eintrag innerhalb von `modelProviders`):**

| Feld               | Erforderlich | Beschreibung                                                                                                                                    |
| ------------------ | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Ja           | Modell-ID, die an die API gesendet wird (z. B. `gpt-4o`, `claude-sonnet-4-20250514`)                                                             |
| `name`             | Nein         | Anzeigename im `/model`-Auswahlmenü (Standard: `id`)                                                                                            |
| `envKey`           | Nein         | Name der Umgebungsvariable für den API-Schlüssel (z. B. `OPENAI_API_KEY`); optional/empfohlen – falls nicht angegeben, wird der Standard-Env-Key des Authentifizierungstyps verwendet |
| `baseUrl`          | Nein         | API-Endpunkt-Override (nützlich für Proxys oder benutzerdefinierte Endpunkte)                                                                   |
| `generationConfig` | Nein         | Feineinstellungen für `timeout`, `maxRetries`, `samplingParams` usw.                                                                            |

> [!note]
>
> Wenn das `env`-Feld in `settings.json` verwendet wird, werden die Anmeldedaten im Klartext gespeichert. Für mehr Sicherheit sind `.env`-Dateien oder `export` in der Shell zu bevorzugen – siehe [Schritt 2](#step-2-set-environment-variables).

Das vollständige `modelProviders`-Schema sowie erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` findest du in der [Referenz für Model Providers](model-providers.md).

#### Schritt 2: Umgebungsvariablen setzen

Qwen Code liest API-Schlüssel aus Umgebungsvariablen (festgelegt durch `envKey` in deiner Modellkonfiguration). Es gibt mehrere Möglichkeiten, diese bereitzustellen, aufgelistet von **höchster bis niedrigster Priorität**:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Direkt im Shell-Profil (`~/.zshrc`, `~/.bashrc` usw.) oder inline vor dem Start setzen:

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

Qwen Code lädt automatisch die **erste** `.env`-Datei, die gefunden wird (Variablen werden **nicht** über mehrere Dateien hinweg zusammengeführt). Es werden nur Variablen geladen, die noch nicht in `process.env` vorhanden sind.

Suchreihenfolge (vom aktuellen Verzeichnis aus aufwärts bis `/`):

1. `.qwen/.env` (bevorzugt – hält Qwen-Code-Variablen von anderen Tools getrennt)
2. `.env`

Wird nichts gefunden, erfolgt ein Fallback auf das **Home-Verzeichnis**:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` wird gegenüber `.env` empfohlen, um Konflikte mit anderen Tools zu vermeiden. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) sind von projekteigenen `.env`-Dateien ausgeschlossen, um eine Beeinträchtigung des Verhaltens von Qwen Code zu vermeiden.

**3. `settings.json` → `env`-Feld (niedrigste Priorität)**

API-Schlüssel können auch direkt in `~/.qwen/settings.json` unter dem Schlüssel `env` definiert werden. Diese werden als **Fallback mit niedrigster Priorität** geladen – nur angewendet, wenn eine Variable nicht bereits von der Systemumgebung oder `.env`-Dateien gesetzt wurde.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Dies ist der Ansatz, der im [Beispiel für die Ein-Datei-Einrichtung](#recommended-one-file-setup-via-settingsjson) oben verwendet wird. Es ist praktisch, alles an einem Ort zu haben, aber bedenke, dass `settings.json` möglicherweise geteilt oder synchronisiert wird – bevorzuge `.env`-Dateien für sensible Geheimnisse.

**Prioritätsübersicht:**

| Priorität        | Quelle                           | Überschreibungsverhalten                                     |
| ---------------- | -------------------------------- | ------------------------------------------------------------ |
| 1 (höchste)      | CLI-Flags (`--openai-api-key`)   | Gewinnt immer                                                |
| 2                | System-Env (`export`, inline)    | Überschreibt `.env` und `settings.json` → `env`              |
| 3                | `.env`-Datei                     | Setzt nur, wenn nicht in System-Env                          |
| 4 (niedrigste)   | `settings.json` → `env`          | Setzt nur, wenn nicht in System-Env oder `.env`             |
#### Schritt 3: Mit `/model` zwischen Modellen wechseln

Starten Sie Qwen Code und verwenden Sie den Befehl `/model`, um zwischen allen konfigurierten Modellen zu wechseln. Die Modelle sind nach Protokoll gruppiert:

```
/model
```

Der Auswahldialog zeigt alle Modelle aus Ihrer `modelProviders`-Konfiguration, gruppiert nach ihrem Protokoll (z. B. `openai`, `anthropic`, `gemini`). Die Auswahl bleibt über Sitzungen hinweg erhalten.

Sie können Modelle auch direkt mit einem Befehlszeilenargument wechseln, was praktisch ist, wenn Sie mit mehreren Terminals arbeiten.

```bash
# In einem Terminal

qwen --model "qwen3-coder-plus"

# In einem anderen Terminal

qwen --model "qwen3.5-plus"
```

## Entfernter CLI-Befehl `qwen auth`

Der eigenständige CLI-Befehl `qwen auth` wurde entfernt. Verwenden Sie stattdessen diese Ersatzlösungen:

| Bisheriger Anwendungsfall                | Ersatz                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------- |
| Interaktive Authentifizierungseinrichtung | Führen Sie `qwen` aus und verwenden Sie dann `/auth`                                        |
| Coding Plan einrichten                   | Verwenden Sie `/auth` oder setzen Sie `BAILIAN_CODING_PLAN_API_KEY` mit der Coding Plan-Basis-URL |
| OpenRouter einrichten                    | Verwenden Sie `/auth` oder setzen Sie `OPENROUTER_API_KEY` und `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Requesty einrichten                      | Verwenden Sie `/auth` oder setzen Sie `REQUESTY_API_KEY` und `OPENAI_BASE_URL=https://router.requesty.ai/v1` |
| API-Key oder benutzerdefinierten Anbieter einrichten | Konfigurieren Sie `~/.qwen/settings.json`, `.env` oder anbieterspezifische Umgebungsvariablen |
| Aktuelle Authentifizierung überprüfen    | Führen Sie `/doctor` in Qwen Code aus                                                       |
| OAuth-Browser-Ablauf                     | Führen Sie `qwen` interaktiv aus und verwenden Sie `/auth`; OAuth kann nicht allein mit Umgebungsvariablen konfiguriert werden |

Legacy-Aufrufe wie `qwen auth status` geben jetzt einen Entfernungshinweis mit diesen Migrationspfaden aus.

## Sicherheitshinweise

- Übertragen Sie API-Schlüssel nicht in die Versionskontrolle.
- Bevorzugen Sie `.qwen/.env` für projektspezifische Geheimnisse (und halten Sie es aus Git heraus).
- Behandeln Sie Ihre Terminalausgabe als sensibel, wenn sie Anmeldeinformationen zur Überprüfung ausgibt.
