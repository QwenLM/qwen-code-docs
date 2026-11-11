# Authentifizierung

Das `/auth`-Menü beim ersten Start von Qwen Code enthält fünf Hauptoptionen. Wählen Sie die Option, die Ihrem gewünschten CLI-Nutzungsmodell entspricht:

- [**Qwen-Konto mit Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli): Melden Sie sich über **Qwen OAuth** mit Ihrem Qwen-Konto an, um auf **Qwen Code und Agent** mit Ihrem **Plus- oder Pro-Abonnement** von [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) zuzugreifen. Falls Sie noch kein Abonnement haben, besuchen Sie [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli), um Plus oder Pro zu abonnieren, kehren Sie dann zu Qwen Code zurück und wählen Sie [**Qwen-Konto mit Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli).
- **QwenCloud**: Offiziell empfohlene Einrichtung. Öffnet ein Untermenü mit **Token Plan** (Abonnement mit monatlichem Credit-Kontingent · dedizierter Endpunkt, Personal- und Team-Editionen) oder **Standard-API-Schlüssel** (nutzungsbasierte Bezahlung). Sie wählen anschließend die Plattform explizit aus — **China — Qianwen AI Platform** oder **International — QwenCloud** — damit die UI-Sprache Ihren Endpunkt nicht bestimmt. Beide Zugriffsmethoden aktivieren auch das integrierte [`web_search`-Tool](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) ohne zusätzliche Einrichtung.
- **Alibaba ModelStudio**: Öffnet ein Untermenü mit **Coding Plan** (für individuelle Entwickler · wöchentliches Kontingent enthalten), **Token Plan** (für Teams und Unternehmen · nutzungsbasierte Abrechnung mit dediziertem Endpunkt) oder **Standard-API-Schlüssel** (Verbindung mit einem vorhandenen ModelStudio-API-Schlüssel). Token Plan und Standard-API-Schlüssel aktivieren auch das integrierte [`web_search`-Tool](https://qwenlm.github.io/qwen-code-docs/en/developers/tools/web-search/) ohne zusätzliche Einrichtung. Gespeicherte ModelStudio-Anmeldedaten, Endpunkte und Modelle funktionieren unverändert weiter.
- **Third-party Providers**: Wähle einen integrierten Provider und verbinde dich mit einem API Key (DeepSeek, Grok, MiniMax, Z.AI, Kimi, Idealab, ModelScope, OpenRouter, Requesty).
- **Custom Provider**: Verbinde manuell einen lokalen Server, Proxy oder nicht unterstützten Provider – unterstützt OpenAI, Anthropic, Gemini und andere kompatible Endpunkte.

## **Option 1: Qwen OAuth —** [**Qwen-Konto mit Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli)

Mit Qwen OAuth können Sie sich mit Ihrem Qwen-Konto anmelden und Ihr **Plus- oder Pro-Abonnement** von [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) nutzen, um auf **Qwen Code und Agent** zuzugreifen. Wählen Sie im Menü für den ersten Start oder im `/auth`-Dialog [**Qwen-Konto mit Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) aus, um zu beginnen.

- **Funktionsweise**: Wählen Sie [**Qwen-Konto mit Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) aus und folgen Sie dem Browser-Anmeldeablauf, um Qwen Code mit Ihrem Qwen-Konto zu autorisieren.
- **Voraussetzungen**: Ein Qwen-Konto mit einem aktiven **Plus- oder Pro-Abonnement** von [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) und Internetzugang.
- **Vorteile**: Zugriff auf **Qwen Code und Agent** über Ihr Qwen-Abonnement, ohne manuell einen API-Schlüssel konfigurieren zu müssen.
- **Kosten & Kontingent**: Die Nutzung unterliegt Ihrem Abonnementplan. Besuchen Sie [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) für Details zu den Plus- und Pro-Plänen.

### **Interaktive Einrichtung**

1. Falls Sie noch kein Abonnement haben, besuchen Sie [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) und abonnieren Sie **Plus oder Pro**. Wenn Sie bereits ein aktives Abonnement haben, fahren Sie mit dem nächsten Schritt fort.
2. Starten Sie Qwen Code in Ihrem Terminal:

   ```bash
   qwen
   ```

3. Wählen Sie im Menü für den ersten Start [**Qwen-Konto mit Abonnement**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli). Falls Qwen Code bereits läuft, geben Sie `/auth` ein, um das Authentifizierungsmenü zu öffnen, und wählen Sie dieselbe Option.
4. Schließen Sie den Anmelde- und Autorisierungsprozess im Browser mit dem **gleichen Qwen-Konto ab, das Sie für das Abonnement bei** [**chat.qwen.ai**](https://chat.qwen.ai/?memberPlan=qwen_code&entry=qwen_code&paywallScene=cli) verwendet haben.
5. Kehren Sie zu Qwen Code zurück, um mit Ihrem Abonnement zu arbeiten.

In nicht-interaktiven Umgebungen, in denen der Browser-Anmeldeablauf nicht abgeschlossen werden kann, wie z. B. CI oder unbeaufsichtigte Container, verwenden Sie stattdessen eine API-Schlüssel-basierte Authentifizierungsmethode.

## ☁️ Option 2: QwenCloud

Der offizielle Plattform-Einstiegspunkt. Wählen Sie diese Option, wenn Ihr API-Schlüssel von Qianwen AI Platform (China) oder QwenCloud (International) stammt.

- **Funktionsweise**: Wählen Sie eine Zugriffsmethode und dann die Plattform explizit aus — die UI-Sprache bestimmt Ihren Endpunkt nicht. Geben Sie den von dieser Plattform ausgestellten Schlüssel ein, und Qwen Code konfiguriert den passenden Endpunkt.
- **Zugriffsmethoden**: **Token Plan** (ein Abonnement mit monatlichem Credit-Kontingent auf einem dedizierten Endpunkt; Personal- und Team-Editionen) oder **Standard-API-Schlüssel** (nutzungsbasierte Bezahlung). Coding Plan wird hier _nicht_ angeboten — es ist ein Alibaba ModelStudio-Produkt, siehe Option 3.
- **Voraussetzungen**: Ein Token Plan-Schlüssel (mit Präfix `sk-sp-`), generiert aus der Token Plan-Konsole, oder ein nutzungsbasierter Schlüssel (mit Präfix `sk-` oder `sk-ws-`) von der API-Schlüsselseite der Plattform.
- **Vorteile**: Beide Zugriffsmethoden aktivieren das integrierte [`web_search`-Tool](../../developers/tools/web-search.md) ohne zusätzliche Einrichtung.

| Plattform                   | Zugriffsmethode  | Endpunkt                                                      | API-Schlüssel                                                                              |
| ------------------------- | ---------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| China — Qwen AI-Plattform   | Standard-API-Schlüssel | `https://maas.qianwenaiapi.com/compatible-mode/v1`            | [API-Schlüssel](https://platform.qianwenai.com/docs/developer-guides/administration/api-keys) |
| China — Qwen AI-Plattform   | Token Plan       | `https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1` | [Token Plan](https://platform.qianwenai.com/docs/token-plan/overview)                    |
| International — QwenCloud   | Standard-API-Schlüssel | `https://maas.qwencloudapi.com/compatible-mode/v1`            | [API-Schlüssel](https://docs.qwencloud.com/developer-guides/administration/api-keys)          |
| International — QwenCloud   | Token Plan       | `https://token-plan.maas.qwencloudapi.com/compatible-mode/v1` | [Token Plan](https://docs.qwencloud.com/token-plan/overview)                             |

### Interaktive Einrichtung

Geben Sie `qwen` im Terminal ein, um Qwen Code zu starten, führen Sie dann den Befehl `/auth` aus, wählen Sie **QwenCloud** und entscheiden Sie sich im Untermenü für **Token Plan** oder **Standard-API-Schlüssel**. Wählen Sie die Plattform (**China — Qwen AI-Plattform** oder **International — QwenCloud**) und geben Sie Ihren API-Schlüssel ein.

Qwen Code prüft beim Start mit Ihrem gespeicherten Schlüssel die Modellliste des Endpunkts; siehe [Integrierte Anbieterupdates](#built-in-provider-updates).

### Headless- oder Skript-Einrichtung

Konfigurieren Sie die Plattform für CI, Container oder Skripte über Umgebungsvariablen anstelle des interaktiven `/auth`-Ablaufs.

```bash
# Pay-as-you-go (Standard API Key), International
export QWENCLOUD_API_KEY="sk-your-api-key"
export OPENAI_BASE_URL="https://maas.qwencloudapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

```bash
# Token Plan, China
export QWENCLOUD_TOKEN_PLAN_API_KEY="sk-sp-your-api-key"
export OPENAI_BASE_URL="https://token-plan.maas.qianwenaiapi.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.8-max"
```

### Alternative: Konfiguration über `settings.json`

Wenn du den interaktiven `/auth`-Flow überspringen möchtest, füge Folgendes zu `~/.qwen/settings.json` hinzu:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.8-max",
        "name": "qwen3.8-max (QwenCloud)",
        "baseUrl": "https://maas.qwencloudapi.com/compatible-mode/v1",
        "description": "qwen3.8-max from QwenCloud Standard API Key",
        "envKey": "QWENCLOUD_API_KEY"
      }
    ]
  },
  "env": {
    "QWENCLOUD_API_KEY": "sk-your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.8-max"
  }
}
```

> [!note]
>
> `capabilities` ist der einzige Anbieterstempel, der nie aus dem Modellnamen abgeleitet wird, sodass ein manuell erstellter Eintrag ohne Reasoning-Deklaration aufgelöst wird und `/effort` die generische Ebenenliste statt QwenClouds kuratierten `low` / `medium` / `xhigh` anbietet. Verwenden Sie `/auth`, um den Anbieter zu installieren, wenn Sie das kuratierte Set wünschen.

Wie bei den anderen anbieterspezifischen Schlüsseln wirken `QWENCLOUD_API_KEY` und `QWENCLOUD_TOKEN_PLAN_API_KEY` erst, wenn ein `settings.json`-Anbietereintrag sie als `envKey` deklariert; um OpenAI-kompatible Authentifizierung nur über Umgebungsvariablen auszuwählen, exportieren Sie stattdessen `OPENAI_API_KEY`.

> [!note]
>
> QwenCloud und Alibaba ModelStudio sind separate Einträge mit separaten Umgebungsvariablen und Endpunkten. Die Auswahl von QwenCloud überschreibt oder löscht keine gespeicherten ModelStudio-Zugangsdaten, Endpunkte oder Modellauswahlen.

## 💳 Option 3: Alibaba Cloud Coding Plan

Verwende diese Option, wenn du vorhersehbare Kosten bei einer Vielzahl von Modelloptionen und höheren Nutzungskontingenten möchtest.

- **Funktionsweise**: Abonniere den Coding Plan mit einer festen monatlichen Gebühr und konfiguriere dann Qwen Code so, dass es den dedizierten Endpunkt und deinen Abonnement-API-Key verwendet.
- **Voraussetzungen**: Hole dir ein aktives Coding-Plan-Abonnement von [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=coding-plan#/efm/coding-plan-index) oder [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index), abhängig von der Region deines Kontos.
- **Vorteile**: Vielfältige Modelloptionen, höhere Nutzungskontingente, vorhersehbare monatliche Kosten, Zugriff auf eine breite Palette von Modellen (Qwen, GLM, Kimi, Minimax und mehr).
- **Kosten & Kontingent**: Siehe Aliyun ModelStudio Coding Plan Dokumentation[Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3005961)[intl](https://modelstudio.console.alibabacloud.com/?tab=doc#/doc/?type=model&url=2840914).

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

| Region                       | Console-URL                                                                  |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Aliyun ModelStudio (Peking) | [bailian.console.aliyun.com](https://bailian.console.aliyun.com)             |
| Alibaba Cloud (intl)        | [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com) |

### Interaktive Einrichtung

Gib `qwen` im Terminal ein, um Qwen Code zu starten, führe dann den Befehl `/auth` aus, wähle **Alibaba ModelStudio** und wähle **Coding Plan** aus dem Untermenü. Wähle deine Region und gib dann deinen `sk-sp-xxxxxxxxx`-Key ein.

Qwen Code prüft beim Start mit Ihrem gespeicherten Schlüssel die Modellliste des Endpunkts; siehe [Integrierte Anbieterupdates](#built-in-provider-updates).

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

## 🪙 Option 4: Alibaba Cloud Token Plan

Verwende diese Option, wenn dein Team oder Unternehmen nutzungsbasierte Abrechnung über einen dedizierten ModelStudio-Endpunkt bevorzugt.

- **Funktionsweise**: Abonniere den Token Plan in Alibaba Cloud ModelStudio und konfiguriere dann Qwen Code so, dass es den regionsspezifischen Token-Plan-Endpunkt und deinen API Key verwendet. Du wirst für die tatsächliche Token-Nutzung abgerechnet, nicht für eine feste monatliche Gebühr.
- **Voraussetzungen**: Hole dir einen Token-Plan-API-Key von [Alibaba Cloud ModelStudio(Beijing)](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) oder [Alibaba Cloud ModelStudio(intl)](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model), abhängig von der Region deines Kontos.
- **Vorteile**: Nutzungsbasierte Abrechnung für Teams und Unternehmen, dedizierte regionsspezifische Endpunkte, Zugriff auf eine breite Palette von Modellen (Qwen, DeepSeek, GLM, Kimi, Minimax und mehr).
- **Kosten & Kontingent**: Siehe Alibaba Cloud ModelStudio Token Plan Dokumentation [Beijing](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3028856) [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model).

Der Token Plan ist in zwei Regionen verfügbar, jeweils mit einem eigenen dedizierten Endpunkt:

| Region                    | Endpunkt                                                               | Console-URL                                                                                         |
| ------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| China (Peking)              | `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`     | [bailian.console.aliyun.com](https://bailian.console.aliyun.com/cn-beijing)                         |
| Singapur (International)    | `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` | [modelstudio.console.alibabacloud.com](https://modelstudio.console.alibabacloud.com/ap-southeast-1) |

### Interaktive Einrichtung

Geben Sie `qwen` im Terminal ein, um Qwen Code zu starten, führen Sie dann den Befehl `/auth` aus, wählen Sie **Alibaba ModelStudio** und entscheiden Sie sich im Untermenü für **Token Plan**. Wählen Sie Ihre Region (**China (Peking)** oder **Singapur (International)**) und geben Sie Ihren API-Schlüssel ein. Der Assistent zeigt dann seinen letzten Schritt (Schritt 3/3 · Modell-IDs), in dem Sie die zu konfigurierenden Modell-IDs auswählen: Die von Ihrem Endpunkt bereitgestellten Modelle werden dort angeboten und nur angewendet, wenn Sie sie explizit auswählen. ModelStudio-Token-Plan-API-Schlüssel haben keine Präfixanforderung, anders als Coding-Plan-Schlüssel, die mit `sk-sp-` beginnen, und anders als die separaten QwenCloud-Token-Plan-Schlüssel in Option 2, die ebenfalls mit `sk-sp-` beginnen.

Verwende nach der Authentifizierung den Befehl `/model`, um zwischen den für deinen Token Plan konfigurierten Modellen zu blättern und zu wechseln. Die Modellpalette entwickelt sich laufend, daher wird sie hier absichtlich nicht aufgelistet; die Modellerkennung vom Endpunkt erfolgt während des obigen `/auth`-Einrichtungsschritts (die eigene Liste des Endpunkts wird dort angeboten und muss explizit ausgewählt werden), und `/model` zeigt dann die für deinen Plan konfigurierten Modelle an.

Qwen Code prüft auch beim Start mit Ihrem gespeicherten API-Schlüssel die Modellliste des Endpunkts, wie unter [Integrierte Anbieterupdates](#built-in-provider-updates) beschrieben.

### Headless- oder Skript-Einrichtung

Konfiguriere für CI, Container oder Skripte den Token Plan mit Umgebungsvariablen oder `settings.json`, anstatt den interaktiven `/auth`-Flow zu verwenden.

```bash
export BAILIAN_TOKEN_PLAN_API_KEY="your-api-key"
export OPENAI_BASE_URL="https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
export OPENAI_MODEL="qwen3.7-plus"
```

Verwende `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` für den China (Beijing) Endpunkt oder `https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1` für den internationalen (Singapore) Endpunkt. Ersetze `qwen3.7-plus` durch ein beliebiges in deinem Plan enthaltenes Modell.

Beachte, dass `BAILIAN_TOKEN_PLAN_API_KEY` ein providerspezifischer Key ist: er wird wirksam, sobald der `settings.json`-Provider-Eintrag im nächsten Abschnitt existiert, da dieser Eintrag ihn als `envKey` deklariert. Um die OpenAI-kompatible Authentifizierung nur mit Umgebungsvariablen auszuwählen, exportiere stattdessen `OPENAI_API_KEY` – providerspezifische Keys wählen nicht von sich aus den Authentifizierungstyp aus.

### Alternative: Konfiguration über `settings.json`

Wenn du den interaktiven `/auth`-Flow überspringen möchtest, füge Folgendes zu `~/.qwen/settings.json` hinzu:

```json
{
  "modelProviders": {
    "openai": [
      {
        "id": "qwen3.7-plus",
        "name": "qwen3.7-plus (Token Plan)",
        "baseUrl": "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
        "description": "qwen3.7-plus from Alibaba Cloud Token Plan",
        "envKey": "BAILIAN_TOKEN_PLAN_API_KEY"
      }
    ]
  },
  "env": {
    "BAILIAN_TOKEN_PLAN_API_KEY": "your-api-key"
  },
  "security": {
    "auth": {
      "selectedType": "openai"
    }
  },
  "model": {
    "name": "qwen3.7-plus"
  }
}
```

> [!note]
>
> Der Token Plan verwendet dedizierte, regionsspezifische Endpunkte (`*.maas.aliyuncs.com`), die sich vom Standard-DashScope-Endpunkt unterscheiden. Stelle sicher, dass die `baseUrl` mit der Region deines Abonnements übereinstimmt.

## 🚀 Option 5: API-Schlüssel (flexibel)

Verwende diese Option, wenn du dich mit Third-party Providern wie OpenAI, Anthropic, Google, Azure OpenAI, OpenRouter, Requesty, ModelScope oder einem selbst gehosteten Endpunkt verbinden möchtest. Unterstützt mehrere Protokolle und Provider.

### Empfohlen: Ein-Datei-Setup über `settings.json` [#recommended-one-file-setup-via-settingsjson]

Der einfachste Weg, um mit der API-Key-Authentifizierung zu beginnen, besteht darin, alles in einer einzigen `~/.qwen/settings.json`-Datei abzulegen. Hier ist ein vollständiges, einsatzbereites Beispiel:

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
| Vertex AI         | `vertex-ai`          | `GOOGLE_API_KEY` + `GOOGLE_MODEL` (setzt `GOOGLE_GENAI_USE_VERTEXAI=true`) oder `GOOGLE_CLOUD_PROJECT` + `GOOGLE_MODEL` (keyless ADC); verwendet das `gemini`-Protokoll | Google Vertex AI                                                                                      |

#### Schritt 1: Modelle und Provider in `~/.qwen/settings.json` konfigurieren

Definiere, welche Modelle für jedes Protokoll verfügbar sind. Jeder Modelleintrag erfordert mindestens eine `id`; `envKey` (der Name der Umgebungsvariable, die deinen API Key enthält) ist optional und empfohlen – wenn weggelassen, wird auf den Standard-Umgebungs-Key des Auth-Typs zurückgegriffen (z. B. `OPENAI_API_KEY` für `openai`).

> [!important]
>
> Es wird empfohlen, `modelProviders` in der `~/.qwen/settings.json` auf Benutzerebene zu definieren, um Merge-Konflikte zwischen Projekt- und Benutzereinstellungen zu vermeiden.

Bearbeite `~/.qwen/settings.json` (erstelle sie, falls sie nicht existiert). Du kannst mehrere Protokolle in einer einzigen Datei mischen – hier ist ein Multi-Provider-Beispiel, das nur den `modelProviders`-Abschnitt zeigt:

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
> Vergessen Sie nicht, auch `env`, `security.auth.selectedType` und `model.name` neben `modelProviders` festzulegen – siehe das [vollständige Beispiel oben](#recommended-one-file-setup-via-settingsjson) zur Referenz.

**`ModelConfig`-Felder (jeder Eintrag innerhalb von `modelProviders`):**

| Feld               | Erforderlich | Beschreibung                                                                                                                                        |
| ------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`               | Ja      | Modell-ID, die an die API gesendet wird (z. B. `gpt-4o`, `claude-sonnet-4-20250514`)                                                                               |
| `wireApi`          | Nein     | OpenAI-kompatibles Anfrageformat: `chat-completions` oder `responses`. Weglassen, um das Anbieterprotokoll zu erben.                                        |
| `name`             | Nein       | Anzeigename in der `/model`-Auswahl (Standard ist `id`)                                                                                             |
| `envKey`           | Nein       | Name der Umgebungsvariable für den API Key (z. B. `OPENAI_API_KEY`); optional/empfohlen – Standard ist der Standard-Umgebungs-Key des Auth-Typs, wenn weggelassen |
| `baseUrl`          | Nein       | API-Endpunkt-Override (nützlich für Proxies oder benutzerdefinierte Endpunkte)                                                                                     |
| `generationConfig` | Nein       | Feinabstimmung von `timeout`, `maxRetries`, `samplingParams` usw.                                                                                          |

> [!note]
>
> Bei Verwendung des `env`-Feldes in `settings.json` werden die Anmeldedaten im Klartext gespeichert. Für bessere Sicherheit solltest du `.env`-Dateien oder Shell-`export` bevorzugen – siehe [Schritt 2](#step-2-set-environment-variables).

Das vollständige `modelProviders`-Schema und erweiterte Optionen wie `generationConfig`, `customHeaders` und `extra_body` findest du in der [Model Providers Reference](./model-providers.md).

#### Schritt 2: Umgebungsvariablen festlegen [#step-2-set-environment-variables]

Qwen Code liest API Keys aus Umgebungsvariablen (angegeben durch `envKey` in deiner Modellkonfiguration). Es gibt mehrere Möglichkeiten, diese bereitzustellen, unten aufgelistet von der **höchsten zur niedrigsten Priorität**:

**1. Shell-Umgebung / `export` (höchste Priorität)**

Direkt in deinem Shell-Profil (`~/.zshrc`, `~/.bashrc` usw.) oder inline vor dem Start festlegen:

```bash

# Alibaba Dashscope
export DASHSCOPE_API_KEY="sk-..."

# OpenAI / OpenAI-compatible
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

Sie können Modelle auch direkt über ein Befehlszeilenargument wechseln, was praktisch ist, wenn Sie in mehreren Terminals arbeiten.

```bash
# In one terminal

qwen --model "qwen3-coder-plus"

# In another terminal

qwen --model "qwen3.5-plus"
```

## Integrierte Anbieterupdates [#built-in-provider-updates]

Installierte Anbieter mit einer integrierten Modellliste können ein **Built-in Provider Update** anbieten, wenn eine neuere Voreinstellung veröffentlicht wird.

QwenCloud (Token Plan und Standard-API-Schlüssel) und Alibaba ModelStudio (Coding Plan, Token Plan und Standard-API-Schlüssel) prüfen beim Start auch `/models`. Diese Prüfung verwendet die von `/auth` gespeicherte anbieterspezifische API-Schlüsselvariable (z. B. `BAILIAN_TOKEN_PLAN_API_KEY`), einschließlich Werte aus `settings.env`. Ein Schlüssel, der nur über ein CLI-Flag, `OPENAI_API_KEY` oder allgemeine Authentifizierungseinstellungen bereitgestellt wird, aktiviert diese Prüfung nicht; allgemeine Schlüssel werden nicht an Endpunkte anderer Anbieter weitergeleitet.

Eine erfolgreiche Erkennung beschränkt das Update auf integrierte Modelle, die mit Ihrem Schlüssel bereitgestellt werden, während benutzerhinzugefügte Modelle erhalten bleiben. Sie kann auch ein Update anbieten, wenn sich der bereitgestellte Satz ohne eine Preset-Veröffentlichung ändert, z. B. nach einem Wechsel des Plans. Die reine Erkennung behält das ausgewählte Modell bei; nachdem Sie gewechselt haben, kann eine spätere Startprüfung dessen Entfernung anbieten. Wenn die Filterung kein integriertes Modell zur Installation übrig lässt, wird die vorhandene Anbieterkonfiguration ohne Aufforderung beibehalten. Wenn sich nur der bereitgestellte Satz ändert, fügt das Update nur neu bereitgestellte Modelle hinzu, sodass ein Modell, das Sie während `/auth` weggelassen haben, nicht wieder hinzugefügt wird. Wenn sich nichts ändern würde, wird die Prüfung ohne Aufforderung protokolliert.

Wenn die Erkennung nicht verfügbar ist, fehlschlägt oder keinem integrierten Modell entspricht, verwendet ein Preset-Update die vollständige Liste integrierter Modelle; eine bereits aktuelle Installation bleibt unverändert. Anbieter ohne Erkennung verwenden weiterhin die integrierte Liste.

**Später** wartet 24 Stunden, bevor es erneut nach derselben Version oder demselben bereitgestellten Satz fragt; eine andere Änderung kann weiterhin eine Aufforderung auslösen. Aktualisieren, Überspringen oder stilles Protokollieren einer neueren Entscheidung löscht die frühere Verschiebung. **Überspringen** behält Ihre Konfiguration bei, einschließlich beibehaltener Modelle: Eine übersprungene Preset-Version wird nicht erneut angeboten, bis eine neuere veröffentlicht wird, und ein übersprungener bereitgestellter Satz wird nicht erneut angeboten, bis er sich ändert.

## Entfernter `qwen auth` CLI-Befehl

Der eigenständige `qwen auth` CLI-Befehl wurde entfernt. Verwende stattdessen diese Ersetzungen:

| Bisheriger Anwendungsfall                | Ersatz                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------- |
| Interaktives Authentifizierungs-Setup | `qwen` ausführen, dann `/auth` verwenden                                                                |
| Coding Plan-Setup                | `/auth` verwenden oder `BAILIAN_CODING_PLAN_API_KEY` mit der Coding Plan-Base-URL setzen             |
| Token Plan-Setup                 | `/auth` verwenden oder `BAILIAN_TOKEN_PLAN_API_KEY` mit der Token Plan-Base-URL für deine Region setzen |
| OpenRouter-Setup                 | `/auth` verwenden oder `OPENROUTER_API_KEY` und `OPENAI_BASE_URL=https://openrouter.ai/api/v1` setzen |
| Requesty-Setup                   | `/auth` verwenden oder `REQUESTY_API_KEY` und `OPENAI_BASE_URL=https://router.requesty.ai/v1` setzen  |
| API-Key- oder Custom-Provider-Setup | `~/.qwen/settings.json`, `.env` oder providerspezifische Umgebungsvariablen konfigurieren       |
| Aktuelle Authentifizierung prüfen     | `/doctor` innerhalb von Qwen Code ausführen                                                              |
| OAuth-Browser-Flow               | `qwen` interaktiv ausführen und `/auth` verwenden; OAuth kann nicht nur mit Umgebungsvariablen konfiguriert werden    |

Legacy-Aufrufe wie `qwen auth status` geben einen Entfernungshinweis aus, der diese Migrationspfade zusammenfasst, einschließlich eines Token-Plan-Eintrags mit den Base-URLs für beide Regionen.

## Security-Hinweise [#security-notes]

- Commite keine API Keys in die Versionskontrolle.
- Bevorzuge `.qwen/.env` für projektlokale Secrets (und halte sie aus Git heraus).
- Behandeln Sie Ihre Terminalausgabe als vertraulich, wenn sie Anmeldeinformationen zur Überprüfung ausgibt.
