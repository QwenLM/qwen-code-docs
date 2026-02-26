# Authentifizierung

Qwen Code unterstützt zwei Authentifizierungsmethoden. Wählen Sie diejenige aus, die zu Ihrer gewünschten CLI-Ausführung passt:

- **Qwen OAuth (empfohlen)**: Anmeldung mit Ihrem `qwen.ai`-Konto im Browser.
- **API-Schlüssel**: Verwendung eines API-Schlüssels zur Verbindung mit jedem unterstützten Anbieter. Flexibler – unterstützt OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian und andere kompatible Endpunkte.

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

## 👍 Option 1: Qwen OAuth (empfohlen & kostenlos)

Verwenden Sie diese Option, wenn Sie die einfachste Einrichtung wünschen und Qwen-Modelle verwenden.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Anmeldeseite. Nach Abschluss des Vorgangs werden die Anmeldeinformationen lokal zwischengespeichert, sodass Sie sich in der Regel nicht erneut anmelden müssen.
- **Voraussetzungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Kein API-Schlüssel-Management, automatische Aktualisierung der Anmeldeinformationen.
- **Kosten & Kontingent**: Kostenlos, mit einem Kontingent von **60 Anfragen/Minute** und **1.000 Anfragen/Tag**.

Starten Sie die CLI und folgen Sie dem Browser-Ablauf:

```bash
qwen
```

> [!note]
>
> In nicht-interaktiven oder headless-Umgebungen (z.B. CI, SSH, Container) können Sie den OAuth-Browser-Anmeldevorgang in der Regel **nicht** abschließen.  
> Verwenden Sie in diesen Fällen bitte die API-Schlüssel-Authentifizierungsmethode.

## 🚀 Option 2: API-Schlüssel (flexibel)

Verwenden Sie diese Option, wenn Sie mehr Flexibilität bezüglich des verwendeten Anbieters und Modells wünschen. Unterstützt mehrere Protokolle und Anbieter, einschließlich OpenAI, Anthropic, Google GenAI, Alibaba Cloud Bailian, Azure OpenAI, OpenRouter, ModelScope oder einen selbst gehosteten kompatiblen Endpunkt.

### Empfohlen: Ein-Datei-Setup über `settings.json`

Der einfachste Weg, mit der API-KEY-Authentifizierung zu beginnen, besteht darin, alles in einer einzigen Datei `~/.qwen/settings.json` unterzubringen. Hier ist ein vollständiges, sofort einsatzbereites Beispiel:

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

Was jedes Feld bewirkt:

| Feld                         | Beschreibung                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `modelProviders`             | Deklariert, welche Modelle verfügbar sind und wie eine Verbindung zu ihnen hergestellt wird. Schlüssel (`openai`, `anthropic`, `gemini`, `vertex-ai`) stellen das API-Protokoll dar. |
| `env`                        | Speichert API-Schlüssel direkt in `settings.json` als Fallback (niedrigste Priorität — Shell-`export` und `.env`-Dateien haben Vorrang).         |
| `security.auth.selectedType` | Teilt Qwen Code mit, welches Protokoll beim Start verwendet werden soll (z.B. `openai`, `anthropic`, `gemini`). Ohne dies müssten Sie `/auth` interaktiv ausführen. |
| `model.name`                 | Das Standardmodell, das aktiviert wird, wenn Qwen Code startet. Muss einem der `id`-Werte in Ihren `modelProviders` entsprechen.                   |

Nachdem Sie die Datei gespeichert haben, führen Sie einfach `qwen` aus — keine interaktive `/auth`-Einrichtung erforderlich.

> [!tip]
>
> Die folgenden Abschnitte erklären jeden Teil detaillierter. Falls das schnelle Beispiel oben für Sie funktioniert, können Sie gerne direkt zu [Sicherheitshinweise](#sicherheitshinweise) springen.

### Option 1: Coding Plan (Aliyun Bailian)

Verwenden Sie diese Option, wenn Sie vorhersehbare Kosten mit höheren Nutzungsquoten für das qwen3-coder-plus-Modell wünschen.

- **Funktionsweise**: Abonnieren Sie den Coding Plan mit einem festen monatlichen Preis und konfigurieren Sie anschließend Qwen Code so, dass es den dedizierten Endpunkt und Ihren Abonnement-API-Schlüssel verwendet.
- **Voraussetzungen**: Beziehen Sie ein aktives Coding Plan-Abonnement von [Alibaba Cloud Bailian](https://bailian.console.aliyun.com/cn-beijing/?tab=globalset#/efm/coding_plan).
- **Vorteile**: Höhere Nutzungsquoten, vorhersehbare monatliche Kosten, Zugang zum neuesten qwen3-coder-plus-Modell.
- **Kosten & Quota**: Siehe [Alibaba Cloud Bailian Coding Plan Dokumentation](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961).

Geben Sie `qwen` im Terminal ein, um Qwen Code zu starten, geben Sie dann den Befehl `/auth` ein und wählen Sie `API-KEY`

![](https://gw.alicdn.com/imgextra/i4/O1CN01yXSXc91uYxJxhJXBF_!!6000000006050-2-tps-2372-916.png)

Nach der Eingabe wählen Sie `Coding Plan`:

![](https://gw.alicdn.com/imgextra/i4/O1CN01Irk0AD1ebfop69o0r_!!6000000003890-2-tps-2308-830.png)

Geben Sie Ihren `sk-sp-xxxxxxxxx`-Schlüssel ein und verwenden Sie anschließend den Befehl `/model`, um zwischen allen von Bailian `Coding Plan` unterstützten Modellen zu wechseln (einschließlich qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 und kimi-k2.5):

![](https://gw.alicdn.com/imgextra/i4/O1CN01fWArmf1kaCEgSmPln_!!6000000004699-2-tps-2304-1374.png)

**Alternative: Coding Plan über `settings.json` konfigurieren**

Wenn Sie den interaktiven `/auth`-Ablauf überspringen möchten, fügen Sie Folgendes zu `~/.qwen/settings.json` hinzu:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3-coder-plus",
        "name": "qwen3-coder-plus (Coding Plan)",
        "baseUrl": "https://coding.dashscope.aliyuncs.com/v1",
        "description": "qwen3-coder-plus aus dem Bailian Coding Plan",
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

### Option 2: API-Schlüssel von Drittanbietern

Verwenden Sie diese Option, wenn Sie sich mit Drittanbietern wie OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, ModelScope oder einem selbst gehosteten Endpunkt verbinden möchten.

Das zentrale Konzept ist **Modellanbieter** (`modelProviders`): Qwen Code unterstützt mehrere API-Protokolle, nicht nur OpenAI. Sie konfigurieren, welche Anbieter und Modelle verfügbar sind, indem Sie `~/.qwen/settings.json` bearbeiten, und wechseln dann zur Laufzeit mit dem Befehl `/model` zwischen ihnen.

#### Unterstützte Protokolle

| Protokoll         | `modelProviders`-Schlüssel | Umgebungsvariablen                                           | Anbieter                                                                                            |
| ----------------- | -------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel | `openai`                   | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud Bailian, beliebiger OpenAI-kompatibler Endpunkt |
| Anthropic         | `anthropic`                | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                                    |
| Google GenAI      | `gemini`                   | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                                       |
| Google Vertex AI  | `vertex-ai`                | `GOOGLE_API_KEY`, `GOOGLE_MODEL`                             | Google Vertex AI                                                                                    |

#### Schritt 1: Konfigurieren Sie Modelle und Anbieter in `~/.qwen/settings.json`

Definieren Sie, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modelleintrag benötigt mindestens eine `id` und einen `envKey` (den Namen der Umgebungsvariablen, die Ihren API-Schlüssel enthält).

> [!important]
>
> Es wird empfohlen, `modelProviders` im benutzerspezifischen `~/.qwen/settings.json` zu definieren, um Merge-Konflikte zwischen Projekten und Benutzereinstellungen zu vermeiden.

Bearbeiten Sie `~/.qwen/settings.json` (erstellen Sie die Datei, falls sie nicht existiert). Sie können mehrere Protokolle in einer einzigen Datei mischen – hier ist ein Beispiel mit mehreren Anbietern, das nur den Abschnitt `modelProviders` zeigt:

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
> Vergessen Sie nicht, auch `env`, `security.auth.selectedType` und `model.name` zusammen mit `modelProviders` festzulegen – siehe [vollständiges Beispiel oben](#recommended-one-file-setup-via-settingsjson) als Referenz.

**`ModelConfig` Felder (jeder Eintrag innerhalb von `modelProviders`):**

| Feld               | Erforderlich | Beschreibung                                                         |
| ------------------ | ------------ | -------------------------------------------------------------------- |
| `id`               | Ja           | Modell-ID, die an die API gesendet wird (z.B. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Nein         | Anzeigename im `/model` Auswahlmenü (Standardwert ist `id`)          |
| `envKey`           | Ja           | Name der Umgebungsvariablen für den API-Schlüssel (z.B. `OPENAI_API_KEY`) |
| `baseUrl`          | Nein         | API-Endpunkt-Überschreibung (nützlich für Proxys oder benutzerdefinierte Endpunkte) |
| `generationConfig` | Nein         | Feinabstimmung von `timeout`, `maxRetries`, `samplingParams`, etc.   |

> [!note]
>
> Bei Verwendung des `env`-Felds in `settings.json` werden Anmeldedaten im Klartext gespeichert. Für bessere Sicherheit bevorzugen Sie `.env`-Dateien oder Shell-`export` – siehe [Schritt 2](#step-2-set-environment-variables).

Für das vollständige `modelProviders` Schema und erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` siehe [Model Providers Reference](model-providers.md).

#### Schritt 2: Umgebungsvariablen festlegen

Qwen Code liest API-Schlüssel aus Umgebungsvariablen (angegeben durch `envKey` in Ihrer Modellkonfiguration). Es gibt mehrere Möglichkeiten, diese bereitzustellen, die unten von **höchster zu niedrigster Priorität** aufgelistet sind:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Direkt in Ihrem Shell-Profil (`~/.zshrc`, `~/.bashrc`, etc.) oder inline vor dem Start festlegen:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-kompatibel
export OPENAI_API_KEY="sk-..."

# Anthropic
export ANTHROPIC_API_KEY="sk-ant-..."
```

# Google GenAI
```bash
export GEMINI_API_KEY="AIza..."
```

**2. `.env`-Dateien**

Qwen Code lädt automatisch die **erste** `.env`-Datei, die es findet (Variablen werden **nicht** über mehrere Dateien hinweg zusammengeführt). Es werden nur Variablen geladen, die noch nicht in `process.env` vorhanden sind.

Suchreihenfolge (vom aktuellen Verzeichnis aus, aufsteigend bis `/`):

1. `.qwen/.env` (bevorzugt — hält Qwen Code-Variablen von anderen Tools getrennt)
2. `.env`

Wenn nichts gefunden wird, greift es auf Ihr **Home-Verzeichnis** zurück:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` wird gegenüber `.env` empfohlen, um Konflikte mit anderen Tools zu vermeiden. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) sind von projektweiten `.env`-Dateien ausgeschlossen, um die Funktionsweise von Qwen Code nicht zu beeinträchtigen.

**3. `settings.json` → `env`-Feld (niedrigste Priorität)**

Sie können API-Schlüssel auch direkt in `~/.qwen/settings.json` unter dem `env`-Schlüssel definieren. Diese werden als **Fallback mit niedrigster Priorität** geladen — nur angewendet, wenn eine Variable noch nicht durch die Systemumgebung oder `.env`-Dateien gesetzt wurde.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Dies ist der Ansatz, der im [Ein-Datei-Setup-Beispiel](#empfohlenes-ein-datei-setup-über-settingsjson) oben verwendet wird. Es ist praktisch, alles an einem Ort zu halten, aber beachten Sie, dass `settings.json` möglicherweise geteilt oder synchronisiert wird — bevorzugen Sie `.env`-Dateien für sensible Geheimnisse.

**Prioritätszusammenfassung:**

| Priorität   | Quelle                          | Überschreibungsverhalten                  |
| ----------- | ------------------------------- | ----------------------------------------- |
| 1 (höchste) | CLI-Flags (`--openai-api-key`)  | Gewinnt immer                             |
| 2           | Systemumgebung (`export`, inline) | Überschreibt `.env` und `settings.env`    |
| 3           | `.env`-Datei                    | Setzt nur, wenn nicht in Systemumgebung   |
| 4 (niedrigste) | `settings.json` → `env`        | Setzt nur, wenn nicht in Systemumgebung oder `.env` |

#### Schritt 3: Modelle mit `/model` wechseln

Nachdem Sie Qwen Code gestartet haben, verwenden Sie den Befehl `/model`, um zwischen allen konfigurierten Modellen zu wechseln. Die Modelle sind nach Protokoll gruppiert:

```
/model
```

Der Auswahldialog zeigt alle Modelle aus Ihrer `modelProviders`-Konfiguration an, gruppiert nach ihrem Protokoll (z.B. `openai`, `anthropic`, `gemini`). Ihre Auswahl wird über Sitzungen hinweg beibehalten.

Sie können Modelle auch direkt mit einem Befehlszeilenargument wechseln, was praktisch ist, wenn Sie mit mehreren Terminals arbeiten.

```bash

# In einem Terminal

qwen --model "qwen3-coder-plus"

# In einem anderen Terminal

qwen --model "qwen3-coder-next"
```

## Sicherheitshinweise

- Committen Sie keine API-Schlüssel in das Versionskontrollsystem.
- Verwenden Sie bevorzugt `.qwen/.env` für projektlokale Geheimnisse (und lassen Sie es außen vor von Git).
- Behandeln Sie Ihre Terminalausgabe als sensibel, wenn sie Anmeldeinformationen zur Überprüfung ausgibt.