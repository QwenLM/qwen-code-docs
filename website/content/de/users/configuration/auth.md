# Authentifizierung

Das `/auth`-Menü bei der ersten Ausführung von Qwen Code bietet drei Optionen auf oberster Ebene. Wählen Sie diejenige aus, die zu Ihrer gewünschten Nutzung der CLI passt:

- **Alibaba ModelStudio**: Offizielle empfohlene Einrichtung. Öffnet ein Untermenü mit **Coding Plan** (für einzelne Entwickler · wöchentliches Kontingent inklusive), **Token Plan** (für Teams und Unternehmen · nutzungsabhängige Abrechnung mit dediziertem Endpunkt) oder **Standard API Key** (mit einem vorhandenen ModelStudio-API-Key verbinden).
- **Third-party Providers**: Wählen Sie einen integrierten Anbieter aus und verbinden Sie sich mit einem API-Key (DeepSeek, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: Stellen Sie manuell eine Verbindung zu einem lokalen Server, Proxy oder nicht unterstützten Anbieter her – unterstützt OpenAI, Anthropic, Gemini und andere kompatible Endpunkte.

> [!note]
>
> **Qwen OAuth** ist kein auswählbarer Dialogeintrag mehr – sein kostenloser Tarif wurde am 15.04.2026 eingestellt. Es wird unten nur noch als fest einprogrammierter, eingestellter Anbieter dokumentiert.

## Option 1: Qwen OAuth (Eingestellt)

> [!warning]
>
> Der kostenlose Tarif von Qwen OAuth wurde am 15.04.2026 eingestellt. Vorhandene zwischengespeicherte Tokens funktionieren möglicherweise noch kurzzeitig, aber neue Anfragen werden abgelehnt. Bitte wechseln Sie zum Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) oder einem anderen Anbieter. Führen Sie `qwen` aus und verwenden Sie `/auth`, um zu konfigurieren.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Anmeldeseite. Nach Abschluss werden die Anmeldedaten lokal zwischengespeichert, sodass Sie sich normalerweise nicht erneut anmelden müssen.
- **Anforderungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Kein API-Key-Management, automatische Aktualisierung der Anmeldedaten.
- **Kosten & Kontingent**: Der kostenlose Tarif wurde am 15.04.2026 eingestellt.

Starten Sie die CLI und folgen Sie dem Browser-Ablauf:

```bash
qwen
```

Qwen OAuth wird nicht mehr als auswählbarer Eintrag im `/auth`-Dialog angeboten; führen Sie `/auth` aus und wählen Sie eine der aktuellen Optionen (Alibaba ModelStudio, Third-party Providers oder Custom Provider) aus.

> [!note]
>
> In nicht-interaktiven oder headless-Umgebungen (z.B. CI, SSH, Container) können Sie den OAuth-Browser-Login-Vorgang normalerweise **nicht** abschließen.
> Verwenden Sie in diesen Fällen die Authentifizierung mit dem Alibaba Cloud Coding Plan oder einem API-Key.

## 💳 Option 2: Alibaba Cloud Coding Plan

Verwenden Sie diese Option, wenn Sie vorhersagbare Kosten mit verschiedenen Modelloptionen und höheren Nutzungskontingenten wünschen.

- **Funktionsweise**: Abonnieren Sie den Coding Plan zu einem festen monatlichen Preis und konfigurieren Sie dann Qwen Code, um den dedizierten Endpunkt und Ihren Abonnement-API-Key zu verwenden.
- **Anforderungen**: Besorgen Sie sich ein aktives Coding Plan-Abonnement über [Alibaba Cloud ModelStudio (Peking)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) oder [Alibaba Cloud ModelStudio (intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), je nach Region Ihres Kontos.
- **Vorteile**: Verschiedene Modelloptionen, höhere Nutzungskontingente, vorhersagbare monatliche Kosten, Zugriff auf eine breite Palette von Modellen (Qwen, GLM, Kimi, Minimax und mehr).
- **Kosten & Kontingent**: Siehe die Dokumentation zum Aliyun ModelStudio Coding Plan: [Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

| Region                           | Konsolen-URL                                                           |
| -------------------------------- | ---------------------------------------------------------------------- |
| Aliyun ModelStudio (Peking)      | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)       |
| Alibaba Cloud (intl)             | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Interaktive Einrichtung

Geben Sie `qwen` im Terminal ein, um Qwen Code zu starten, führen Sie dann den Befehl `/auth` aus, wählen Sie **Alibaba ModelStudio** und dann **Coding Plan** aus dem Untermenü. Wählen Sie Ihre Region aus und geben Sie Ihren `sk-sp-xxxxxxxxx`-Key ein.

Verwenden Sie nach der Authentifizierung den Befehl `/model`, um zwischen allen von Alibaba Cloud Coding Plan unterstützten Modellen zu wechseln (einschließlich qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 und MiniMax-M2.5).

### Headless- oder Skript-Einrichtung

Konfigurieren Sie den Coding Plan für CI, Container oder Skripte mit Umgebungsvariablen oder `settings.json` anstelle des entfernten Befehls `qwen auth coding-plan`.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Verwenden Sie `https://coding.dashscope.aliyuncs.com/v1` für den Endpunkt in China (Peking) oder `https://coding-intl.dashscope.aliyuncs.com/v1` für den internationalen Endpunkt.

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
          "description": "qwen3-coder-plus von Alibaba Cloud Coding Plan",
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
> Der Coding Plan verwendet einen dedizierten Endpunkt (`https://coding.dashscope.aliyuncs.com/v1`), der sich vom standardmäßigen Dashscope-Endpunkt unterscheidet. Stellen Sie sicher, dass Sie die richtige `baseUrl` verwenden.

## 🚀 Option 3: API-Key (flexibel)

Verwenden Sie diese Option, wenn Sie eine Verbindung zu Drittanbieter-Providern wie OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope oder einem selbst gehosteten Endpunkt herstellen möchten. Unterstützt mehrere Protokolle und Anbieter.

### Empfohlen: Ein-File-Setup über `settings.json`

Der einfachste Weg, mit der API-Key-Authentifizierung zu beginnen, ist, alles in eine einzige Datei `~/.qwen/settings.json` zu packen. Hier ist ein vollständiges, sofort einsatzbereites Beispiel:

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

| Feld                        | Beschreibung                                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `modelProviders`            | Deklariert, welche Modelle verfügbar sind und wie eine Verbindung zu ihnen hergestellt wird. Schlüssel (`openai`, `anthropic`, `gemini`) repräsentieren das API-Protokoll. |
| `env`                       | Speichert API-Keys direkt in `settings.json` als Fallback (niedrigste Priorität – `export` in der Shell und `.env`-Dateien haben Vorrang).        |
| `security.auth.selectedType`| Teilt Qwen Code mit, welches Protokoll beim Start verwendet werden soll (z.B. `openai`, `anthropic`, `gemini`). Ohne dies müssten Sie `/auth` interaktiv ausführen. |
| `model.name`                | Das Standardmodell, das beim Start von Qwen Code aktiviert wird. Muss mit einem der `id`-Werte in Ihren `modelProviders` übereinstimmen.          |

Nachdem Sie die Datei gespeichert haben, führen Sie einfach `qwen` aus – kein interaktiver `/auth`-Ablauf erforderlich.

> [!tip]
>
> Die folgenden Abschnitte erläutern die einzelnen Teile detaillierter. Wenn das obige Kurzbeispiel für Sie funktioniert, können Sie direkt zu den [Sicherheitshinweisen](#security-notes) springen.

Das Schlüsselkonzept sind die **Model Providers** (`modelProviders`): Qwen Code unterstützt mehrere API-Protokolle, nicht nur OpenAI. Sie konfigurieren, welche Anbieter und Modelle verfügbar sind, indem Sie `~/.qwen/settings.json` bearbeiten, und wechseln dann zur Laufzeit mit dem Befehl `/model` zwischen ihnen.

#### Unterstützte Protokolle

| Protokoll          | `modelProviders`-Schlüssel | Umgebungsvariablen                                                                              | Anbieter                                                                                           |
| ------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel  | `openai`                   | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`                                             | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, jeder OpenAI-kompatible Endpunkt |
| Anthropic          | `anthropic`                | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                    | Anthropic Claude                                                                                   |
| Google GenAI       | `gemini`                   | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                | Google Gemini                                                                                      |
| Vertex AI          | `vertex-ai`                | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (setzt `GOOGLE_GENAI_USE_VERTEXAI=true`; verwendet das `gemini`-Protokoll) | Google Vertex AI                                                                                   |

#### Schritt 1: Modelle und Anbieter in `~/.qwen/settings.json` konfigurieren

Definieren Sie, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modelleintrag benötigt mindestens eine `id`; `envKey` (der Name der Umgebungsvariable, die Ihren API-Key enthält) ist optional und empfohlen – wenn er weggelassen wird, wird auf den Standard-Env-Key des Authentifizierungstyps zurückgegriffen (z.B. `OPENAI_API_KEY` für `openai`).

> [!important]
>
> Es wird empfohlen, `modelProviders` in der benutzerspezifischen Datei `~/.qwen/settings.json` zu definieren, um Zusammenführungskonflikte zwischen Projekt- und Benutzereinstellungen zu vermeiden.

Bearbeiten Sie `~/.qwen/settings.json` (erstellen Sie sie, falls sie nicht existiert). Sie können mehrere Protokolle in einer einzigen Datei mischen – hier ein Multi-Provider-Beispiel, das nur den `modelProviders`-Abschnitt zeigt:

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
> Vergessen Sie nicht, auch `env`, `security.auth.selectedType` und `model.name` zusammen mit `modelProviders` zu setzen – siehe das [vollständige Beispiel oben](#recommended-one-file-setup-via-settingsjson) als Referenz.

**`ModelConfig`-Felder (jeder Eintrag innerhalb von `modelProviders`):**

| Feld               | Erforderlich | Beschreibung                                                                                                                                       |
| ------------------ | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Ja           | Modell-ID, die an die API gesendet wird (z.B. `gpt-4o`, `claude-sonnet-4-20250514`)                                                                |
| `name`             | Nein         | Anzeigename im `/model`-Auswahldialog (standardmäßig `id`)                                                                                         |
| `envKey`           | Nein         | Name der Umgebungsvariable für den API-Key (z.B. `OPENAI_API_KEY`); optional/empfohlen – standardmäßig zum Standard-Env-Key des Authentifizierungstyps, wenn weggelassen |
| `baseUrl`          | Nein         | Überschreibung des API-Endpunkts (nützlich für Proxys oder benutzerdefinierte Endpunkte)                                                           |
| `generationConfig` | Nein         | Feineinstellung von `timeout`, `maxRetries`, `samplingParams` usw.                                                                                  |

> [!note]
>
> Bei Verwendung des `env`-Felds in `settings.json` werden Anmeldedaten im Klartext gespeichert. Aus Sicherheitsgründen bevorzugen Sie `.env`-Dateien oder `export` in der Shell – siehe [Schritt 2](#step-2-set-environment-variables).

Das vollständige `modelProviders`-Schema und erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` finden Sie in der [Model Providers Referenz](model-providers.md).

#### Schritt 2: Umgebungsvariablen setzen

Qwen Code liest API-Keys aus Umgebungsvariablen (angegeben durch `envKey` in Ihrer Modellkonfiguration). Es gibt mehrere Möglichkeiten, sie bereitzustellen, aufgelistet von **höchster zu niedrigster Priorität**:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Setzen Sie sie direkt in Ihrem Shell-Profil (`~/.zshrc`, `~/.bashrc` usw.) oder inline vor dem Start:

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

Qwen Code lädt automatisch die **erste** `.env`-Datei, die es findet (Variablen werden **nicht** über mehrere Dateien hinweg zusammengeführt). Nur Variablen, die nicht bereits in `process.env` vorhanden sind, werden geladen.

Suchreihenfolge (vom aktuellen Verzeichnis aus aufwärts zum `/`):

1. `.qwen/.env` (bevorzugt – hält Qwen Code-Variablen von anderen Tools isoliert)
2. `.env`

Wenn nichts gefunden wird, wird auf Ihr **Home-Verzeichnis** zurückgegriffen:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` wird gegenüber `.env` empfohlen, um Konflikte mit anderen Tools zu vermeiden. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) sind von projektebene `.env`-Dateien ausgeschlossen, um Beeinträchtigungen des Qwen Code-Verhaltens zu vermeiden.

**3. `settings.json` → `env`-Feld (niedrigste Priorität)**

Sie können API-Keys auch direkt in `~/.qwen/settings.json` unter dem `env`-Schlüssel definieren. Diese werden als **Fallback mit niedrigster Priorität** geladen – nur angewendet, wenn eine Variable nicht bereits durch die Systemumgebung oder `.env`-Dateien gesetzt ist.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Dies ist der Ansatz, der im [Ein-File-Setup-Beispiel](#recommended-one-file-setup-via-settingsjson) oben verwendet wird. Es ist praktisch, alles an einem Ort zu haben, aber denken Sie daran, dass `settings.json` möglicherweise geteilt oder synchronisiert wird – bevorzugen Sie `.env`-Dateien für vertrauliche Geheimnisse.

**Prioritätsübersicht:**

| Priorität   | Quelle                            | Überschreibungsverhalten                                       |
| ----------- | --------------------------------- | -------------------------------------------------------------- |
| 1 (höchste) | CLI-Flags (`--openai-api-key`)    | Gewinnt immer                                                   |
| 2           | System-Env (`export`, inline)     | Überschreibt `.env` und `settings.json` → `env`                |
| 3           | `.env`-Datei                      | Setzt nur, wenn nicht in System-Env                            |
| 4 (niedrige)| `settings.json` → `env`           | Setzt nur, wenn weder in System-Env noch `.env`                |

#### Schritt 3: Modelle mit `/model` wechseln

Nach dem Start von Qwen Code verwenden Sie den Befehl `/model`, um zwischen allen konfigurierten Modellen zu wechseln. Modelle werden nach Protokoll gruppiert:

```bash
/model
```

Der Auswahldialog zeigt alle Modelle aus Ihrer `modelProviders`-Konfiguration, gruppiert nach ihrem Protokoll (z.B. `openai`, `anthropic`, `gemini`). Ihre Auswahl wird über Sitzungen hinweg beibehalten.

Sie können Modelle auch direkt mit einem Kommandozeilenargument wechseln, was praktisch ist, wenn Sie mit mehreren Terminals arbeiten.

```bash
# In einem Terminal
qwen --model "qwen3-coder-plus"

# In einem anderen Terminal
qwen --model "qwen3.5-plus"
```

## Entfernter `qwen auth` CLI-Befehl

Der eigenständige CLI-Befehl `qwen auth` wurde entfernt. Verwenden Sie stattdessen diese Ersatzlösungen:

| Bisheriger Anwendungsfall           | Ersatz                                                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Interaktive Authentifizierung       | Führen Sie `qwen` aus, dann verwenden Sie `/auth`                                                       |
| Coding Plan-Einrichtung             | Verwenden Sie `/auth` oder setzen Sie `BAILIAN_CODING_PLAN_API_KEY` mit der Coding Plan-Basis-URL       |
| OpenRouter-Einrichtung              | Verwenden Sie `/auth` oder setzen Sie `OPENROUTER_API_KEY` und `OPENAI_BASE_URL=https://openrouter.ai/api/v1` |
| Requesty-Einrichtung                | Verwenden Sie `/auth` oder setzen Sie `REQUESTY_API_KEY` und `OPENAI_BASE_URL=https://router.requesty.ai/v1`  |
| API-Key oder Custom Provider        | Konfigurieren Sie `~/.qwen/settings.json`, `.env` oder anbieterspezifische Umgebungsvariablen           |
| Aktuelle Authentifizierung prüfen   | Führen Sie `/doctor` innerhalb von Qwen Code aus                                                        |
| OAuth-Browser-Ablauf                | Führen Sie `qwen` interaktiv aus und verwenden Sie `/auth`; OAuth kann nicht nur mit Umgebungsvariablen konfiguriert werden |

Legacy-Aufrufe wie `qwen auth status` geben nun einen Entfernungs-Hinweis mit diesen Migrationspfaden aus.

## Sicherheitshinweise

- Keys nicht in die Versionskontrolle einchecken.
- Bevorzugen Sie `.qwen/.env` für projektspezifische Geheimnisse (und halten Sie diese aus Git heraus).
- Behandeln Sie Ihre Terminalausgabe als sensibel, wenn sie Anmeldedaten zur Überprüfung ausgibt.