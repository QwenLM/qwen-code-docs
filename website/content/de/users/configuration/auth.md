# Authentifizierung

Das `/auth`-Menü von Qwen Code beim ersten Start bietet drei Hauptoptionen. Wähle diejenige aus, die deiner gewünschten CLI-Nutzung entspricht:

- **Alibaba ModelStudio**: offiziell empfohlene Einrichtung. Öffnet ein Untermenü mit **Coding Plan** (für einzelne Entwickler · wöchentliches Kontingent inklusive), **Token Plan** (für Teams und Unternehmen · nutzungsbasierte Abrechnung mit dediziertem Endpunkt) oder **Standard API Key** (Verbindung mit einem bestehenden ModelStudio API Key).
- **Third-party Providers**: Wähle einen integrierten Provider und verbinde dich mit einem API Key (DeepSeek, MiniMax, Z.AI, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: Verbinde manuell einen lokalen Server, Proxy oder nicht unterstützten Provider – unterstützt OpenAI, Anthropic, Gemini und andere kompatible Endpunkte.

> [!note]
>
> **Qwen OAuth** ist kein auswählbarer Dialogeintrag mehr – der kostenlose Tarif wurde am 2026-04-15 eingestellt. Er wird unten nur noch als fest codierter, eingestellter Provider dokumentiert.

## Option 1: Qwen OAuth (eingestellt)

> [!warning]
>
> Der kostenlose Qwen OAuth-Tarif wurde am 2026-04-15 eingestellt. Bereits zwischengespeicherte Token funktionieren möglicherweise noch kurzzeitig, aber neue Anfragen werden abgelehnt. Bitte wechsle zum Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) oder einem anderen Provider. Starte `qwen` und verwende `/auth` zur Konfiguration.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Login-Seite. Nach Abschluss werden die Anmeldedaten lokal zwischengespeichert, sodass du dich normalerweise nicht erneut anmelden musst.
- **Voraussetzungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Kein API-Key-Management, automatische Aktualisierung der Anmeldedaten.
- **Kosten & Kontingent**: Der kostenlose Tarif wurde zum 2026-04-15 eingestellt.

Starte die CLI und folge dem Browser-Flow:

```bash
qwen
```

Qwen OAuth wird nicht mehr als auswählbarer Eintrag im `/auth`-Dialog angeboten; führe stattdessen `/auth` aus und wähle eine der aktuellen Optionen (Alibaba ModelStudio, Third-party Providers oder Custom Provider).

> [!note]
>
> In nicht-interaktiven oder Headless-Umgebungen (z. B. CI, SSH, Container) kannst du den OAuth-Browser-Login-Flow in der Regel **nicht** abschließen.
> Verwende in diesen Fällen bitte den Alibaba Cloud Coding Plan oder die API-Key-Authentifizierungsmethode.

## 💳 Option 2: Alibaba Cloud Coding Plan

Verwende diese Option, wenn du vorhersehbare Kosten bei einer Vielzahl von Modelloptionen und höheren Nutzungskontingenten möchtest.

- **Funktionsweise**: Abonniere den Coding Plan mit einer festen monatlichen Gebühr und konfiguriere dann Qwen Code so, dass es den dedizierten Endpunkt und deinen Abonnement-API-Key verwendet.
- **Voraussetzungen**: Hole dir ein aktives Coding-Plan-Abonnement von [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) oder [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), abhängig von der Region deines Kontos.
- **Vorteile**: Vielfältige Modelloptionen, höhere Nutzungskontingente, vorhersehbare monatliche Kosten, Zugriff auf eine breite Palette von Modellen (Qwen, GLM, Kimi, Minimax und mehr).
- **Kosten & Kontingent**: Siehe Aliyun ModelStudio Coding Plan Dokumentation[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

| Region                       | Console-URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Interaktive Einrichtung

Gib `qwen` im Terminal ein, um Qwen Code zu starten, führe dann den Befehl `/auth` aus, wähle **Alibaba ModelStudio** und wähle **Coding Plan** aus dem Untermenü. Wähle deine Region und gib dann deinen `sk-sp-xxxxxxxxx`-Key ein.

Verwende nach der Authentifizierung den Befehl `/model`, um zwischen allen vom Alibaba Cloud Coding Plan unterstützten Modellen zu wechseln (einschließlich qwen3.5-plus, qwen3.6-plus, qwen3.7-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max-2026-01-23, glm-5, glm-4.7, kimi-k2.5 und MiniMax-M2.5).

### Headless- oder Skript-Einrichtung

Konfiguriere für CI, Container oder Skripte den Coding Plan mit Umgebungsvariablen oder `settings.json`, anstatt den entfernten Befehl `qwen auth coding-plan` zu verwenden.

```bash
export BAILIAN_CODING_PLAN_API_KEY="sk-sp-xxxxxxxxx"
export OPENAI_BASE_URL="https://coding.dashscope.aliyuncs.com/v1"
export OPENAI_MODEL="qwen3-coder-plus"
```

Verwende `https://coding.dashscope.aliyuncs.com/v1` für den China (Beijing) Endpunkt oder `https://coding-intl.dashscope.aliyuncs.com/v1` für den internationalen Endpunkt.

### Alternative: Konfiguration über `settings.json`

Wenn du den interaktiven `/auth`-Flow überspringen möchtest, füge Folgendes zu `~/.qwen/settings.json` hinzu:

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
> Der Coding Plan verwendet einen dedizierten Endpunkt (`https://coding.dashscope.aliyuncs.com/v1`), der sich vom Standard-Dashscope-Endpunkt unterscheidet. Stelle sicher, dass du die korrekte `baseUrl` verwendest.

## 🚀 Option 3: API Key (flexibel)

Verwende diese Option, wenn du dich mit Third-party Providern wie OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope oder einem selbst gehosteten Endpunkt verbinden möchtest. Unterstützt mehrere Protokolle und Provider.

### Empfohlen: Ein-Datei-Setup über `settings.json`

Der einfachste Weg, um mit der API-Key-Authentifizierung zu beginnen, besteht darin, alles in einer einzigen `~/.qwen/settings.json`-Datei abzulegen. Hier ist ein vollständiges, einsatzbereites Beispiel:

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

Funktion der einzelnen Felder:

| Feld                         | Beschreibung                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Deklariert, welche Modelle verfügbar sind und wie mit ihnen verbunden wird. Die Keys (`openai`, `anthropic`, `gemini`) repräsentieren das API-Protokoll.              |
| `env`                        | Speichert API Keys als Fallback direkt in `settings.json` (niedrigste Priorität – Shell-`export` und `.env`-Dateien haben Vorrang).                  |
| `security.auth.selectedType` | Weist Qwen Code an, welches Protokoll beim Start verwendet werden soll (z. B. `openai`, `anthropic`, `gemini`). Ohne diese Angabe musst du `/auth` interaktiv ausführen. |
| `model.name`                 | Das Standardmodell, das beim Start von Qwen Code aktiviert wird. Muss mit einem der `id`-Werte in deinen `modelProviders` übereinstimmen.                                |

Nach dem Speichern der Datei starte einfach `qwen` – kein interaktives `/auth`-Setup erforderlich.

> [!tip]
>
> Die folgenden Abschnitte erklären jeden Teil im Detail. Wenn das obige Schnellbeispiel für dich funktioniert, kannst du direkt zu [Security notes](#security-notes) springen.

Das Schlüsselkonzept sind **Model Providers** (`modelProviders`): Qwen Code unterstützt mehrere API-Protokolle, nicht nur OpenAI. Du konfigurierst, welche Provider und Modelle verfügbar sind, indem du `~/.qwen/settings.json` bearbeitest, und wechselst dann zur Laufzeit mit dem Befehl `/model` zwischen ihnen.

#### Unterstützte Protokolle

| Protokoll          | `modelProviders`-Key | Umgebungsvariablen                                                                                | Provider                                                                                             |
| ----------------- | -------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL` (Alias: `QWEN_MODEL`)                            | OpenAI, Azure OpenAI, OpenRouter, Requesty, ModelScope, Alibaba Cloud, jeder OpenAI-kompatible Endpunkt |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL`                                         | Anthropic Claude                                                                                      |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                     | Google Gemini                                                                                         |
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY`, `GOOGLE_MODEL` (setzt `GOOGLE_GENAI_USE_VERTEXAI=true`; verwendet das `gemini`-Protokoll) | Google Vertex AI                                                                                      |

#### Schritt 1: Modelle und Provider in `~/.qwen/settings.json` konfigurieren

Definiere, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modelleintrag erfordert mindestens eine `id`; `envKey` (der Name der Umgebungsvariable, die deinen API Key enthält) ist optional und empfohlen – wenn weggelassen, wird auf den Standard-Umgebungs-Key des Auth-Typs zurückgegriffen (z. B. `OPENAI_API_KEY` für `openai`).

> [!important]
>
> Es wird empfohlen, `modelProviders` in der `~/.qwen/settings.json` auf Benutzerebene zu definieren, um Merge-Konflikte zwischen Projekt- und Benutzereinstellungen zu vermeiden.

Bearbeite `~/.qwen/settings.json` (erstelle sie, falls sie nicht existiert). Du kannst mehrere Protokolle in einer einzigen Datei mischen – hier ist ein Multi-Provider-Beispiel, das nur den `modelProviders`-Abschnitt zeigt:

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
> Vergiss nicht, neben `modelProviders` auch `env`, `security.auth.selectedType` und `model.name` festzulegen – siehe das [vollständige Beispiel oben](#recommended-one-file-setup-via-settingsjson) als Referenz.

**`ModelConfig`-Felder (jeder Eintrag innerhalb von `modelProviders`):**

| Feld               | Erforderlich | Beschreibung                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Ja      | Modell-ID, die an die API gesendet wird (z. B. `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `name`             | Nein       | Anzeigename in der `/model`-Auswahl (Standard ist `id`)                                                                                             |
| `envKey`           | Nein       | Name der Umgebungsvariable für den API Key (z. B. `OPENAI_API_KEY`); optional/empfohlen – Standard ist der Standard-Umgebungs-Key des Auth-Typs, wenn weggelassen |
| `baseUrl`          | Nein       | API-Endpunkt-Override (nützlich für Proxies oder benutzerdefinierte Endpunkte)                                                                                     |
| `generationConfig` | Nein       | Feinabstimmung von `timeout`, `maxRetries`, `samplingParams` usw.                                                                                          |

> [!note]
>
> Bei Verwendung des `env`-Feldes in `settings.json` werden die Anmeldedaten im Klartext gespeichert. Für bessere Sicherheit solltest du `.env`-Dateien oder Shell-`export` bevorzugen – siehe [Schritt 2](#step-2-set-environment-variables).

Das vollständige `modelProviders`-Schema und erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` findest du in der [Model Providers Reference](model-providers.md).

#### Schritt 2: Umgebungsvariablen festlegen

Qwen Code liest API Keys aus Umgebungsvariablen (angegeben durch `envKey` in deiner Modellkonfiguration). Es gibt mehrere Möglichkeiten, diese bereitzustellen, unten aufgelistet von der **höchsten zur niedrigsten Priorität**:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Direkt in deinem Shell-Profil (`~/.zshrc`, `~/.bashrc` usw.) oder inline vor dem Start festlegen:

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

Qwen Code lädt automatisch die **erste** `.env`-Datei, die es findet (Variablen werden über mehrere Dateien hinweg **nicht zusammengeführt**). Es werden nur Variablen geladen, die noch nicht in `process.env` vorhanden sind.

Suchreihenfolge (ausgehend vom aktuellen Verzeichnis, nach oben zu `/`):

1. `.qwen/.env` (bevorzugt – hält Qwen Code-Variablen isoliert von anderen Tools)
2. `.env`

Wenn nichts gefunden wird, wird auf dein **Home-Verzeichnis** zurückgegriffen:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` wird gegenüber `.env` empfohlen, um Konflikte mit anderen Tools zu vermeiden. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) werden aus `.env`-Dateien auf Projektebene ausgeschlossen, um das Verhalten von Qwen Code nicht zu beeinträchtigen.

**3. `settings.json` → `env`-Feld (niedrigste Priorität)**

Du kannst API Keys auch direkt in `~/.qwen/settings.json` unter dem `env`-Key definieren. Diese werden als **Fallback mit der niedrigsten Priorität** geladen – sie werden nur angewendet, wenn eine Variable nicht bereits durch die Systemumgebung oder `.env`-Dateien gesetzt ist.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Dies ist der Ansatz, der im obigen [Ein-Datei-Setup-Beispiel](#recommended-one-file-setup-via-settingsjson) verwendet wird. Es ist praktisch, um alles an einem Ort zu behalten, aber beachte, dass `settings.json` möglicherweise geteilt oder synchronisiert wird – bevorzuge `.env`-Dateien für sensible Secrets.

**Prioritätsübersicht:**

| Priorität    | Quelle                         | Override-Verhalten                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (höchste) | CLI-Flags (`--openai-api-key`) | Hat immer Vorrang                                  |
| 2           | System-Umgebung (`export`, inline)  | Überschreibt `.env` und `settings.json` → `env` |
| 3           | `.env`-Datei                    | Wird nur gesetzt, wenn nicht in der System-Umgebung               |
| 4 (niedrigste)  | `settings.json` → `env`        | Wird nur gesetzt, wenn nicht in der System-Umgebung oder `.env`     |

#### Schritt 3: Modelle mit `/model` wechseln

Verwende nach dem Start von Qwen Code den Befehl `/model`, um zwischen allen konfigurierten Modellen zu wechseln. Modelle werden nach Protokoll gruppiert:

```
/model
```

Die Auswahl zeigt alle Modelle aus deiner `modelProviders`-Konfiguration an, gruppiert nach ihrem Protokoll (z. B. `openai`, `anthropic`, `gemini`). Deine Auswahl wird über Sitzungen hinweg beibehalten.

Du kannst Modelle auch direkt mit einem Befehlszeilenargument wechseln, was praktisch ist, wenn du über mehrere Terminals hinweg arbeitest.

```bash
# In einem Terminal

qwen --model "qwen3-coder-plus"

# In einem anderen Terminal

qwen --model "qwen3.5-plus"
```

## Entfernter qwen auth CLI-Befehl

Der eigenständige `qwen auth` CLI-Befehl wurde entfernt. Verwende stattdessen diese Ersetzungen:

| Bisheriger Anwendungsfall                | Ersatz                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Interaktives Authentifizierungs-Setup | `qwen` ausführen, dann `/auth` verwenden                                                                |
| Coding Plan-Setup                | `/auth` verwenden oder `BAILIAN_CODING_PLAN_API_KEY` mit der Coding Plan-Base-URL setzen             |
| OpenRouter-Setup                 | `/auth` verwenden oder `OPENROUTER_API_KEY` und `OPENAI_BASE_URL=https://openrouter.ai/api/v1` setzen |
| Requesty-Setup                   | `/auth` verwenden oder `REQUESTY_API_KEY` und `OPENAI_BASE_URL=https://router.requesty.ai/v1` setzen  |
| API-Key- oder Custom-Provider-Setup | `~/.qwen/settings.json`, `.env` oder providerspezifische Umgebungsvariablen konfigurieren       |
| Aktuelle Authentifizierung prüfen     | `/doctor` innerhalb von Qwen Code ausführen                                                              |
| OAuth-Browser-Flow               | `qwen` interaktiv ausführen und `/auth` verwenden; OAuth kann nicht nur mit Umgebungsvariablen konfiguriert werden    |

Legacy-Aufrufe wie `qwen auth status` geben nun einen Entfernungshinweis mit diesen Migrationspfaden aus.

## Security-Hinweise

- Commite keine API Keys in die Versionskontrolle.
- Bevorzuge `.qwen/.env` für projektlokale Secrets (und halte sie aus Git heraus).
- Behandle deine Terminalausgabe als sensibel, wenn sie Anmeldedaten zur Überprüfung ausgibt.