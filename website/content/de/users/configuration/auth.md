---
description: "Vergleichen Sie die 3 Authentifizierungsmethoden von Qwen Code: API Key, Alibaba Cloud Coding Plan und OAuth. Wählen Sie schnell die passende Anmeldung."
---

# Authentifizierung

Qwen Code unterstützt drei Authentifizierungsmethoden. Wähle diejenige, die zu deinem gewünschten CLI-Workflow passt:

- **Qwen OAuth**: Melde dich im Browser mit deinem `qwen.ai`-Konto an. **Kostenloser Tarif am 2026-04-15 eingestellt** — wechsle zu einer anderen Methode.
- **Alibaba Cloud Coding Plan**: Verwende einen API-Key von Alibaba Cloud. Kostenpflichtiges Abonnement mit vielfältigen Modell-Optionen und höheren Kontingenten.
- **API Key**: Verwende deinen eigenen API-Key. Flexibel anpassbar an deine Anforderungen — unterstützt OpenAI, Anthropic, Gemini und andere kompatible Endpunkte.

## Option 1: Qwen OAuth (Eingestellt)

> [!warning]
>
> Der kostenlose Qwen OAuth-Tarif wurde am 2026-04-15 eingestellt. Bestehende zwischengespeicherte Tokens mögen noch kurz funktionieren, aber neue Anfragen werden abgelehnt. Bitte wechsle zum Alibaba Cloud Coding Plan, [OpenRouter](https://openrouter.ai), [Fireworks AI](https://app.fireworks.ai) oder einem anderen Anbieter. Führe `qwen auth` aus, um die Konfiguration vorzunehmen.

- **Funktionsweise**: Beim ersten Start öffnet Qwen Code eine Browser-Login-Seite. Nach Abschluss werden die Anmeldedaten lokal zwischengespeichert, sodass du dich in der Regel nicht erneut anmelden musst.
- **Voraussetzungen**: Ein `qwen.ai`-Konto + Internetzugang (zumindest für die erste Anmeldung).
- **Vorteile**: Keine Verwaltung von API-Keys, automatische Aktualisierung der Anmeldedaten.
- **Kosten & Kontingent**: Der kostenlose Tarif wurde zum 2026-04-15 eingestellt.

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
> In nicht-interaktiven oder headless-Umgebungen (z. B. CI, SSH, Container) kannst du den OAuth-Browser-Login-Flow in der Regel **nicht** abschließen.  
> In diesen Fällen verwende bitte die Authentifizierungsmethode Alibaba Cloud Coding Plan oder API Key.

## 💳 Option 2: Alibaba Cloud Coding Plan

Verwende diese Option, wenn du planbare Kosten mit vielfältigen Modell-Optionen und höheren Nutzungskontingenten möchtest.

- **Funktionsweise**: Abonniere den Coding Plan mit einer festen monatlichen Gebühr und konfiguriere dann Qwen Code so, dass der dedizierte Endpunkt und dein Abonnement-API-Key verwendet werden.
- **Voraussetzungen**: Hole dir ein aktives Coding-Plan-Abonnement von [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) oder [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), abhängig von der Region deines Kontos.
- **Vorteile**: Vielfältige Modell-Optionen, höhere Nutzungskontingente, planbare monatliche Kosten, Zugriff auf eine breite Palette von Modellen (Qwen, GLM, Kimi, Minimax und mehr).
- **Kosten & Kontingent**: Siehe die Dokumentation zum Aliyun ModelStudio Coding Plan [Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961) [intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

| Region                       | Console-URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Beijing) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)         | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Interaktive Einrichtung

Du kannst die Coding-Plan-Authentifizierung auf zwei Arten einrichten:

**Option A: Über das Terminal (empfohlen für die Ersteinrichtung)**

```bash
# Interaktiv — fragt nach Region und API-Key
qwen auth coding-plan

# Oder nicht-interaktiv — Region und Key direkt übergeben
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx
```

**Option B: Innerhalb einer Qwen Code-Sitzung**

Gib `qwen` im Terminal ein, um Qwen Code zu starten, führe dann den `/auth`-Befehl aus und wähle **Alibaba Cloud Coding Plan**. Wähle deine Region und gib dann deinen `sk-sp-xxxxxxxxx`-Key ein.

Nach der Authentifizierung verwende den `/model`-Befehl, um zwischen allen vom Alibaba Cloud Coding Plan unterstützten Modellen zu wechseln (einschließlich qwen3.5-plus, qwen3-coder-plus, qwen3-coder-next, qwen3-max, glm-4.7 und kimi-k2.5).

### Alternative: Konfiguration über `settings.json`

Wenn du den interaktiven `/auth`-Flow umgehen möchtest, füge Folgendes zu `~/.qwen/settings.json` hinzu:

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
> Der Coding Plan verwendet einen dedizierten Endpunkt (`https://coding.dashscope.aliyuncs.com/v1`), der sich vom standardmäßigen Dashscope-Endpunkt unterscheidet. Stelle sicher, dass du die korrekte `baseUrl` verwendest.

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
| `modelProviders`             | Definiert, welche Modelle verfügbar sind und wie die Verbindung hergestellt wird. Die Keys (`openai`, `anthropic`, `gemini`) repräsentieren das API-Protokoll.              |
| `env`                        | Speichert API-Keys direkt in `settings.json` als Fallback (niedrigste Priorität — Shell-`export` und `.env`-Dateien haben Vorrang).                  |
| `security.auth.selectedType` | Gibt Qwen Code vor, welches Protokoll beim Start verwendet werden soll (z. B. `openai`, `anthropic`, `gemini`). Ohne diese Angabe müsstest du `/auth` interaktiv ausführen. |
| `model.name`                 | Das Standardmodell, das beim Start von Qwen Code aktiviert wird. Muss mit einem der `id`-Werte in deinen `modelProviders` übereinstimmen.                                |

Nach dem Speichern der Datei führe einfach `qwen` aus — kein interaktives `/auth`-Setup erforderlich.

> [!tip]
>
> Die folgenden Abschnitte erklären die einzelnen Teile detaillierter. Wenn das obige Schnellbeispiel für dich funktioniert, kannst du gerne direkt zu [Sicherheitshinweise](#security-notes) springen.

Das zentrale Konzept sind **Model Providers** (`modelProviders`): Qwen Code unterstützt mehrere API-Protokolle, nicht nur OpenAI. Du konfigurierst, welche Anbieter und Modelle verfügbar sind, indem du `~/.qwen/settings.json` bearbeitest, und wechselst zur Laufzeit mit dem `/model`-Befehl zwischen ihnen.

#### Unterstützte Protokolle

| Protokoll           | `modelProviders`-Key | Umgebungsvariablen                                        | Anbieter                                                                                   |
| ----------------- | -------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| OpenAI-kompatibel | `openai`             | `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`          | OpenAI, Azure OpenAI, OpenRouter, ModelScope, Alibaba Cloud, beliebiger OpenAI-kompatibler Endpunkt |
| Anthropic         | `anthropic`          | `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` | Anthropic Claude                                                                            |
| Google GenAI      | `gemini`             | `GEMINI_API_KEY`, `GEMINI_MODEL`                             | Google Gemini                                                                               |

#### Schritt 1: Modelle und Anbieter in `~/.qwen/settings.json` konfigurieren

Definiere, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modell-Eintrag benötigt mindestens eine `id` und einen `envKey` (den Namen der Umgebungsvariable, die deinen API-Key enthält).

> [!important]
>
> Es wird empfohlen, `modelProviders` im benutzerbezogenen `~/.qwen/settings.json` zu definieren, um Merge-Konflikte zwischen Projekt- und Benutzereinstellungen zu vermeiden.

Bearbeite `~/.qwen/settings.json` (erstelle die Datei, falls sie nicht existiert). Du kannst mehrere Protokolle in einer einzigen Datei kombinieren – hier ist ein Multi-Provider-Beispiel, das nur den `modelProviders`-Abschnitt zeigt:

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
> Vergiss nicht, zusätzlich `env`, `security.auth.selectedType` und `model.name` neben `modelProviders` zu setzen – siehe das [vollständige Beispiel oben](#recommended-one-file-setup-via-settingsjson) als Referenz.

**`ModelConfig`-Felder (jeder Eintrag innerhalb von `modelProviders`):**

| Feld              | Erforderlich | Beschreibung                                                          |
| ------------------ | -------- | -------------------------------------------------------------------- |
| `id`               | Ja      | Modell-ID, die an die API gesendet wird (z. B. `gpt-4o`, `claude-sonnet-4-20250514`) |
| `name`             | Nein       | Anzeigename im `/model`-Auswahlmenü (Standard ist `id`)               |
| `envKey`           | Ja      | Name der Umgebungsvariable für den API-Key (z. B. `OPENAI_API_KEY`)    |
| `baseUrl`          | Nein       | Überschreibt den API-Endpunkt (nützlich für Proxies oder benutzerdefinierte Endpunkte)       |
| `generationConfig` | Nein       | Feinabstimmung von `timeout`, `maxRetries`, `samplingParams` usw.            |

> [!note]
>
> Wenn du das `env`-Feld in `settings.json` verwendest, werden die Anmeldedaten als Plain Text gespeichert. Für bessere Sicherheit bevorzuge `.env`-Dateien oder Shell-`export` – siehe [Schritt 2](#step-2-set-environment-variables).

Für das vollständige `modelProviders`-Schema und erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` siehe [Model Providers Reference](model-providers.md).

#### Schritt 2: Umgebungsvariablen setzen

Qwen Code liest API-Keys aus Umgebungsvariablen (angegeben durch `envKey` in deiner Modell-Konfiguration). Es gibt mehrere Möglichkeiten, sie bereitzustellen, unten aufgelistet von **höchster zu niedrigster Priorität**:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Setze sie direkt in deinem Shell-Profil (`~/.zshrc`, `~/.bashrc` usw.) oder inline vor dem Start:

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

Qwen Code lädt automatisch die **erste** `.env`-Datei, die es findet (Variablen werden **nicht** über mehrere Dateien hinweg zusammengeführt). Nur Variablen, die noch nicht in `process.env` vorhanden sind, werden geladen.

Suchreihenfolge (vom aktuellen Verzeichnis aus nach oben bis `/`):

1. `.qwen/.env` (bevorzugt – hält Qwen-Code-Variablen isoliert von anderen Tools)
2. `.env`

Wenn nichts gefunden wird, wird auf dein **Home-Verzeichnis** zurückgegriffen:

3. `~/.qwen/.env`
4. `~/.env`

> [!tip]
>
> `.qwen/.env` wird gegenüber `.env` empfohlen, um Konflikte mit anderen Tools zu vermeiden. Einige Variablen (wie `DEBUG` und `DEBUG_MODE`) sind von projektbezogenen `.env`-Dateien ausgeschlossen, um das Verhalten von Qwen Code nicht zu beeinträchtigen.

**3. `settings.json` → `env`-Feld (niedrigste Priorität)**

Du kannst API-Keys auch direkt in `~/.qwen/settings.json` unter dem `env`-Key definieren. Diese werden als **Fallback mit niedrigster Priorität** geladen – sie werden nur angewendet, wenn eine Variable nicht bereits durch die Systemumgebung oder `.env`-Dateien gesetzt ist.

```json
{
  "env": {
    "DASHSCOPE_API_KEY": "sk-...",
    "OPENAI_API_KEY": "sk-...",
    "ANTHROPIC_API_KEY": "sk-ant-..."
  }
}
```

Dies ist der Ansatz, der im [Ein-Datei-Setup-Beispiel](#recommended-one-file-setup-via-settingsjson) oben verwendet wird. Es ist praktisch, um alles an einem Ort zu halten, aber beachte, dass `settings.json` geteilt oder synchronisiert werden kann – bevorzuge `.env`-Dateien für sensible Secrets.

**Prioritätsübersicht:**

| Priorität    | Quelle                         | Überschreibungsverhalten                            |
| ----------- | ------------------------------ | -------------------------------------------- |
| 1 (höchste) | CLI-Flags (`--openai-api-key`) | Gewinnt immer                                  |
| 2           | Systemumgebung (`export`, inline)  | Überschreibt `.env` und `settings.json` → `env` |
| 3           | `.env`-Datei                    | Wird nur gesetzt, wenn nicht in Systemumgebung vorhanden               |
| 4 (niedrigste)  | `settings.json` → `env`        | Wird nur gesetzt, wenn nicht in Systemumgebung oder `.env` vorhanden     |

#### Schritt 3: Modelle mit `/model` wechseln

Nach dem Start von Qwen Code verwende den `/model`-Befehl, um zwischen allen konfigurierten Modellen zu wechseln. Modelle sind nach Protokoll gruppiert:

```
/model
```

Das Auswahlmenü zeigt alle Modelle aus deiner `modelProviders`-Konfiguration, gruppiert nach ihrem Protokoll (z. B. `openai`, `anthropic`, `gemini`). Deine Auswahl wird sitzungsübergreifend gespeichert.

Du kannst Modelle auch direkt über ein Kommandozeilen-Argument wechseln, was praktisch ist, wenn du mit mehreren Terminals arbeitest.

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

Du siehst einen Auswahldialog mit Pfeiltasten-Navigation:

```
Select authentication method:

  Alibaba Cloud Coding Plan - Paid · Up to 6,000 requests/5 hrs · All Alibaba Cloud Coding Plan Models
  API Key - Bring your own API key
  Qwen OAuth - Discontinued — switch to Coding Plan or API Key

(Use ↑ ↓ arrows to navigate, Enter to select, Ctrl+C to exit)
```

### Unterbefehle

| Befehl                                              | Beschreibung                                       |
| ---------------------------------------------------- | ------------------------------------------------- |
| `qwen auth`                                          | Interaktive Authentifizierungseinrichtung                  |
| `qwen auth coding-plan`                              | Authentifizierung mit Alibaba Cloud Coding Plan       |
| `qwen auth coding-plan --region china --key sk-sp-…` | Nicht-interaktive Coding-Plan-Einrichtung (für Skripte) |
| `qwen auth api-key`                                  | Authentifizierung mit einem API-Key                      |
| `qwen auth qwen-oauth`                               | Authentifizierung mit Qwen OAuth (eingestellt)       |
| `qwen auth status`                                   | Zeigt den aktuellen Authentifizierungsstatus                |

**Beispiele:**

```bash
# Direkt mit Qwen OAuth authentifizieren
qwen auth qwen-oauth

# Coding Plan interaktiv einrichten (fragt nach Region und Key)
qwen auth coding-plan

# Coding Plan nicht-interaktiv einrichten (nützlich für CI/Skripte)
qwen auth coding-plan --region china --key sk-sp-xxxxxxxxx

# API-Key einrichten (ModelStudio Standard oder benutzerdefinierter Anbieter)
qwen auth api-key

# Aktuelle Auth-Konfiguration prüfen
qwen auth status
```

## Sicherheitshinweise

- Committe keine API-Keys in die Versionskontrolle.
- Verwende `.qwen/.env` für projektlokale Secrets (und halte sie aus Git heraus).
- Behandle deine Terminal-Ausgabe als vertraulich, wenn sie Anmeldedaten zur Verifikation ausgibt.