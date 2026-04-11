# Authentifizierung

Qwen Code unterstützt drei Authentifizierungsmethoden. Wähle diejenige, die am besten zu deinem gewünschten CLI-Setup passt:

- **Qwen OAuth**: Melde dich im Browser mit deinem `qwen.ai`-Konto an. Kostenlos mit einem täglichen Kontingent.
- **Alibaba Cloud Coding Plan**: Verwende einen API Key von Alibaba Cloud. Kostenpflichtiges Abonnement mit verschiedenen Modelloptionen und höheren Kontingenten.
- **API Key**: Verwende deinen eigenen API Key. Flexibel an deine Bedürfnisse anpassbar – unterstützt OpenAI, Anthropic, Gemini und andere kompatible Endpunkte.

## Option 1: Qwen OAuth (Kostenlos)

Verwende diese Option, wenn du das einfachste Setup möchtest und Qwen-Modelle nutzt.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Login-Seite. Nach Abschluss werden die Anmeldedaten lokal zwischengespeichert, sodass du dich in der Regel nicht erneut anmelden musst.
- **Voraussetzungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Keine Verwaltung von API Keys, automatische Aktualisierung der Anmeldedaten.
- **Kosten & Kontingent**: Kostenlos, mit einem Limit von **60 Anfragen/Minute** und **1.000 Anfragen/Tag**.

Starte die CLI und folge dem Browser-Flow:

```bash
qwen
```

Oder authentifiziere dich direkt, ohne eine Sitzung zu starten:

```bash
qwen auth qwen-oauth
```

> [!note]
>
> In nicht-interaktiven oder headless Umgebungen (z. B. CI, SSH, Containern) kannst du den OAuth-Browser-Login-Flow in der Regel **nicht** abschließen.  
> Verwende in diesen Fällen bitte die Authentifizierungsmethode „Alibaba Cloud Coding Plan“ oder „API Key“.

## 💳 Option 2: Alibaba Cloud Coding Plan

Verwende diese Option, wenn du planbare Kosten, verschiedene Modelloptionen und höhere Nutzungskontingente möchtest.

- **Funktionsweise**: Abonniere den Coding Plan mit einer festen monatlichen Gebühr und konfiguriere Qwen Code so, dass der dedizierte Endpunkt und dein Abonnement-API-Key verwendet werden.
- **Voraussetzungen**: Hole dir ein aktives Coding-Plan-Abonnement von [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) oder [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), abhängig von der Region deines Kontos.
- **Vorteile**: Verschiedene Modelloptionen, höhere Nutzungskontingente, planbare monatliche Kosten, Zugriff auf eine breite Palette von Modellen (Qwen, GLM, Kimi, Minimax und mehr).
- **Kosten & Kontingent**: Siehe die Dokumentation zum Aliyun ModelStudio Coding Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

| Region                       | Console-URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Interaktives Setup

Du kannst die Coding-Plan-Authentifizierung auf zwei Arten einrichten:

**Option A: Über das Terminal (empfohlen für die Ersteinrichtung)**

```bash
# Interaktiv — fragt nach Region und API Key
qwen auth coding-plan

# Oder nicht-interaktiv — übergibt Region und Key direkt
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**Option B: Innerhalb einer Qwen Code-Sitzung**

Gib `qwen` im Terminal ein, um Qwen Code zu starten, führe dann den `/auth`-Befehl aus und wähle **Alibaba Cloud Coding Plan**. Wähle deine Region und gib deinen `sk-sp-xxxxxxxxx`-Key ein.

Nach der Authentifizierung kannst du mit dem `/model`-Befehl zwischen allen vom Alibaba Cloud Coding Plan unterstützten Modellen wechseln (u. a. qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 und kimi-k2.5).

### Alternative: Konfiguration über `settings.json`

Wenn du den interaktiven `/auth`-Flow überspringen möchtest, füge Folgendes zu `~/.qwen/settings.json` hinzu:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus from Alibaba Cloud Coding Plan",
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
> Der Coding Plan verwendet einen dedizierten Endpunkt (`https://coding.dashscope.aliyuncs.com/v1`), der sich vom Standard-Dashscope-Endpunkt unterscheidet. Stelle sicher, dass du die korrekte `baseUrl` verwendest.

## 🚀 Option 3: API Key (flexibel)

Verwende diese Option, wenn du dich mit Drittanbietern wie OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope oder einem selbst gehosteten Endpunkt verbinden möchtest. Unterstützt mehrere Protokolle und Anbieter.

### Empfohlen: Ein-Datei-Setup über `settings.json`

Der einfachste Weg, um mit der API-Key-Authentifizierung zu starten, ist, alles in einer einzigen `~/.qwen/settings.json`-Datei zu speichern. Hier ist ein vollständiges, sofort einsatzbereites Beispiel:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus",
        "baseUrl": "https://dashscope.aliyuncs.com/compatible-mode/v1",
        "description": "Qwen3-Coder via Dashscope",
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

Bedeutung der einzelnen Felder:

| Feld                         | Beschreibung                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Definiert, welche Modelle verfügbar sind und wie die Verbindung hergestellt wird. Die Schlüssel (`openai`, `anthropic`, `gemini`) stehen für das API-Protokoll.              |
| `env`                        | Speichert API Keys direkt in `settings.json` als Fallback (niedrigste Priorität – Shell-`export` und `.env`-Dateien haben Vorrang).                  |
| `security.auth.selectedType` | Weist Qwen Code an, welches Protokoll beim Start verwendet werden soll (z. B. `openai`, `anthropic`, `gemini`). Ohne diesen Wert müsstest du `/auth` interaktiv ausführen. |
| `model.name`                 | Das Standardmodell, das beim Start von Qwen Code aktiviert wird. Muss mit einem der `id`-Werte in deinen `modelProviders` übereinstimmen.                                |

Nach dem Speichern der Datei führe einfach `qwen` aus – kein interaktives `/auth`-Setup erforderlich.

> [!tip]
>
> Die folgenden Abschnitte erläutern die einzelnen Teile detaillierter. Wenn das obige Schnellbeispiel für dich funktioniert, kannst du direkt zu den [Sicherheitshinweisen](#security-notes) springen.

Das zentrale Konzept sind **Model Providers** (`modelProviders`): Qwen Code unterstützt mehrere API-Protokolle, nicht nur OpenAI. Du konfigurierst, welche Anbieter und Modelle verfügbar sind, indem du `~/.qwen/settings.json` bearbeitest, und wechselst zur Laufzeit mit dem `/model`-Befehl zwischen ihnen.

#### Unterstützte Protokolle

| Protokoll           | `modelProviders`-Schlüssel | Umgebungsvariablen                                        | Anbieter                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, jeder OpenAI-kompatible Endpunkt |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### Schritt 1: Modelle und Anbieter in `~/.qwen/settings.json` konfigurieren

Definiere, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modelleintrags benötigt mindestens eine `id` und einen `envKey` (der Name der Umgebungsvariable, die deinen API Key enthält).

> [!important]
>
> Es wird empfohlen, `modelProviders` im benutzerspezifischen `~/.qwen/settings.json` zu definieren, um Merge-Konflikte zwischen Projekt- und Benutzereinstellungen zu vermeiden.

Bearbeite `~/.qwen/settings.json` (erstelle die Datei, falls sie nicht existiert). Du kannst mehrere Protokolle in einer einzigen Datei kombinieren – hier ist ein Multi-Anbieter-Beispiel, das nur den `modelProviders`-Abschnitt zeigt:

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
> Vergiss nicht, neben `modelProviders` auch `env`, `security.auth.selectedType` und `model.name` festzulegen – siehe das [vollständige Beispiel oben](#recommended-one-file-setup-via-settingsjson) als Referenz.

**`ModelConfig`-Felder (jeder Eintrag innerhalb von `modelProviders`):**

| Feld               | Erforderlich | Beschreibung                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | Ja      | Modell-ID, die an die API gesendet wird (z. B. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Nein       | Anzeigename im `/model`-Auswahlfeld (Standard ist `id`)               |
| `envKey`           | Ja      | Name der Umgebungsvariable für den API Key (z. B. `OPENAI_API_KEY`)    |
| `baseUrl`          | Nein       | Überschreibt den API-Endpunkt (nützlich für Proxys oder benutzerdefinierte Endpunkte)       |
| `generationConfig` | Nein       | Feinabstimmung von `timeout`, `maxRetries`, `samplingParams` usw.            |

> [!note]
>
> Bei Verwendung des `env`-Felds in `settings.json` werden Anmeldedaten im Klartext gespeichert. Für mehr Sicherheit solltest du `.env`-Dateien oder Shell-`export` bevorzugen – siehe [Schritt 2](#step-2-set-environment-variables).

Das vollständige `modelProviders`-Schema und erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` findest du in der [Model Providers Reference](model-providers.md).

#### Schritt 2: Umgebungsvariablen festlegen

Qwen Code liest API Keys aus Umgebungsvariablen (angegeben durch `envKey` in deiner Modellkonfiguration). Es gibt mehrere Möglichkeiten, sie bereitzustellen, unten aufgelistet von **höchster zu niedrigster Priorität**:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Lege sie direkt in deinem Shell-Profil (`~/.zshrc`, `~/.bashrc` usw.) oder inline vor dem Start fest:

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

Qwen Code lädt automatisch die **erste** gefundene `.env`-Datei (Variablen werden **nicht** über mehrere Dateien hinweg zusammengeführt). Es werden nur Variablen geladen, die noch nicht in `process.env` vorhanden sind.

Suchreihenfolge (vom aktuellen Verzeichnis aus aufwärts bis `/`):

1. `.qwen/.env` (empfohlen – isoliert Qwen-Code-Variablen von anderen Tools)
2. `.env`

Falls nichts gefunden wird, wird auf dein **Home-Verzeichnis** zurückgegriffen:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` wird gegenüber `.env` empfohlen, um Konflikte mit anderen Tools zu vermeiden. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) werden von `.env`-Dateien auf Projektebene ausgeschlossen, um das Verhalten von Qwen Code nicht zu beeinträchtigen.

**3. `settings.json` → `env`-Feld (niedrigste Priorität)**

Du kannst API Keys auch direkt in `~/.qwen/settings.json` unter dem Schlüssel `env` definieren. Diese werden als **Fallback mit niedrigster Priorität** geladen – sie kommen nur zum Einsatz, wenn eine Variable noch nicht durch die Systemumgebung oder `.env`-Dateien gesetzt wurde.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Dies ist der Ansatz, der im obigen [Ein-Datei-Setup-Beispiel](#recommended-one-file-setup-via-settingsjson) verwendet wird. Es ist praktisch, um alles an einem Ort zu speichern, aber beachte, dass `settings.json` geteilt oder synchronisiert werden kann – verwende für sensible Secrets bevorzugt `.env`-Dateien.

**Prioritätsübersicht:**

| Priorität    | Quelle                         | Überschreibungsverhalten                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (höchste) | CLI-Flags (`--openai-api-key`) | Setzt sich immer durch                                  |
| 2           | Systemumgebung (`export`, inline)  | Überschreibt `.env` und `settings.json` → `env` |
| 3           | `.env`-Datei                    | Wird nur gesetzt, wenn nicht in der Systemumgebung vorhanden               |
| 4 (niedrigste)  | `settings.json` → `env`        | Wird nur gesetzt, wenn nicht in Systemumgebung oder `.env` vorhanden     |

#### Schritt 3: Modelle mit `/model` wechseln

Nach dem Start von Qwen Code verwende den `/model`-Befehl, um zwischen allen konfigurierten Modellen zu wechseln. Modelle sind nach Protokoll gruppiert:

```
/model
```

Das Auswahlfeld zeigt alle Modelle aus deiner `modelProviders`-Konfiguration, gruppiert nach ihrem Protokoll (z. B. `openai`, `anthropic`, `gemini`). Deine Auswahl wird sitzungsübergreifend gespeichert.

Du kannst Modelle auch direkt über ein Kommandozeilenargument wechseln, was praktisch ist, wenn du mit mehreren Terminals arbeitest.

```bash
# In einem Terminal

qwen --model "qwen3-coder-plus"

# In einem anderen Terminal

qwen --model "qwen3.5-plus"
```

## `qwen auth` CLI-Befehl

Zusätzlich zum `/auth`-Slash-Befehl innerhalb der Sitzung bietet Qwen Code einen eigenständigen `qwen auth` CLI-Befehl, um die Authentifizierung direkt über das Terminal zu verwalten – ohne vorher eine interaktive Sitzung zu starten.

### Interaktiver Modus

Führe `qwen auth` ohne Argumente aus, um ein interaktives Menü zu erhalten:

```bash
qwen auth
```

Du siehst eine Auswahl mit Pfeiltasten-Navigation:

```
Select authentication method:

> Qwen OAuth - Free · Up to 1,000 requests/day · Qwen latest models
  Alibaba Cloud Coding Plan - Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models

(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)
```

### Unterbefehle

| Befehl                                              | Beschreibung                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | Interaktives Authentifizierungs-Setup                  |
| `qwen auth qwen-oauth`                               | Authentifizierung mit Qwen OAuth                      |
| `qwen auth coding-plan`                              | Authentifizierung mit Alibaba Cloud Coding Plan       |
| `qwen auth coding-plan --region china --key sk-sp-…` | Nicht-interaktives Coding-Plan-Setup (für Skripte) |
| `qwen auth status`                                   | Zeigt den aktuellen Authentifizierungsstatus                |

**Beispiele:**

```bash
# Authentifiziere dich direkt mit Qwen OAuth
qwen auth qwen-oauth

# Richte Coding Plan interaktiv ein (fragt nach Region und Key)
qwen auth coding-plan

# Richte Coding Plan nicht-interaktiv ein (nützlich für CI/Skripte)
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# Prüfe deine aktuelle Auth-Konfiguration
qwen auth status
```

## Sicherheitshinweise

- Commite keine API Keys in die Versionskontrolle.
- Verwende bevorzugt `.qwen/.env` für projektlokale Secrets (und schließe sie aus Git aus).
- Behandle deine Terminalausgabe als sensibel, wenn sie Anmeldedaten zur Verifikation ausgibt.