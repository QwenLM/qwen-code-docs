# Qwen Code: Nutzungsbedingungen und Datenschutzerklärung

Qwen Code ist ein quelloffenes KI-Coding-Assistenten-Tool, das vom Qwen Code-Team gewartet wird. Dieses Dokument beschreibt die Nutzungsbedingungen und Datenschutzrichtlinien, die bei der Verwendung der Authentifizierungsmethoden und KI-Modelldienste von Qwen Code gelten.

## So ermitteln Sie Ihre Authentifizierungsmethode

Qwen Code unterstützt vier Authentifizierungsmethoden für den Zugriff auf KI-Modelle. Ihre Authentifizierungsmethode bestimmt, welche Nutzungsbedingungen und Datenschutzrichtlinien für Ihre Nutzung gelten:

1. **Qwen OAuth** — Anmeldung mit Ihrem qwen.ai-Konto (kostenlose Stufe eingestellt am 15.04.2026)
2. **Alibaba Cloud Coding Plan** — Verwendung eines API-Keys von Alibaba Cloud
3. **API Key** — Verwendung eines eigenen API-Keys
4. **Vertex AI** — Verwendung von Google Cloud Vertex AI

Für jede Authentifizierungsmethode können unterschiedliche Nutzungsbedingungen und Datenschutzerklärungen gelten, abhängig vom zugrunde liegenden Dienstanbieter.

| Authentifizierungsmethode | Anbieter        | Nutzungsbedingungen                                                                   | Datenschutzerklärung                                                                  |
| :------------------------ | :-------------- | :------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------ |
| Qwen OAuth                | Qwen AI         | [Qwen Nutzungsbedingungen](https://qwen.ai/termsservice)                              | [Qwen Datenschutzrichtlinie](https://qwen.ai/privacypolicy)                           |
| Alibaba Cloud Coding Plan | Alibaba Cloud   | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan)                  | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan)                  |
| API Key                   | Verschiedene Anbieter | Abhängig vom gewählten API-Anbieter (OpenAI, Anthropic, etc.)                   | Abhängig vom gewählten API-Anbieter                                                   |
| Vertex AI                 | Google Cloud    | [Google Cloud Nutzungsbedingungen](https://cloud.google.com/terms)                    | [Google Cloud Datenschutz](https://cloud.google.com/privacy)                          |

## 1. Wenn Sie Qwen OAuth-Authentifizierung verwenden

Wenn Sie sich mit Ihrem qwen.ai-Konto authentifizieren, gelten diese Nutzungsbedingungen und diese Datenschutzerklärung:

- **Nutzungsbedingungen:** Ihre Nutzung unterliegt den [Qwen Nutzungsbedingungen](https://qwen.ai/termsservice).
- **Datenschutzerklärung:** Die Erhebung und Nutzung Ihrer Daten wird in der [Qwen Datenschutzrichtlinie](https://qwen.ai/privacypolicy) beschrieben.

Details zur Einrichtung der Authentifizierung, zu Kontingenten und unterstützten Funktionen finden Sie unter [Authentifizierung einrichten](../configuration/settings).

## 2. Wenn Sie den Alibaba Cloud Coding Plan verwenden

Wenn Sie sich mit einem API-Key von Alibaba Cloud authentifizieren, gelten die entsprechenden Nutzungsbedingungen und Datenschutzerklärungen von Alibaba Cloud.

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Bei Verwendung des Alibaba Cloud Coding Plan unterliegen Sie den Bedingungen und Datenschutzrichtlinien von Alibaba Cloud. Bitte lesen Sie deren Dokumentation für spezifische Details zur Datennutzung, -aufbewahrung und zu Datenschutzpraktiken.

## 3. Wenn Sie Ihren eigenen API-Key verwenden

Wenn Sie sich mit API-Keys anderer Anbieter authentifizieren, hängen die geltenden Nutzungsbedingungen und Datenschutzerklärungen von Ihrem gewählten Anbieter ab.

> [!important]
>
> Bei Verwendung Ihres eigenen API-Keys unterliegen Sie den Bedingungen und Datenschutzrichtlinien Ihres gewählten API-Anbieters, nicht den Bedingungen von Qwen Code. Bitte lesen Sie die Dokumentation Ihres Anbieters für spezifische Details zur Datennutzung, -aufbewahrung und zu Datenschutzpraktiken.

Qwen Code unterstützt verschiedene OpenAI-kompatible Anbieter. Bitte lesen Sie für detaillierte Informationen die Nutzungsbedingungen und Datenschutzrichtlinien Ihres spezifischen Anbieters.

## 4. Wenn Sie Vertex AI verwenden

Wenn Sie sich mit Google Cloud Vertex AI authentifizieren, gelten die Nutzungsbedingungen und Datenschutzerklärungen von Google Cloud.

> [!important]
>
> Bei Verwendung von Vertex AI unterliegen Sie den [Nutzungsbedingungen von Google Cloud](https://cloud.google.com/terms) und der [Datenschutzerklärung von Google Cloud](https://cloud.google.com/privacy), nicht den Bedingungen von Qwen Code. Bitte lesen Sie die Dokumentation von Google Cloud für spezifische Details zur Datennutzung, -aufbewahrung und zu Datenschutzpraktiken.

## Nutzungsstatistiken und Telemetrie

Qwen Code kann anonyme Nutzungsstatistiken und [Telemetriedaten](../../developers/development/telemetry) erfassen, um die Benutzererfahrung und Produktqualität zu verbessern. Diese Datenerfassung ist optional und kann über Konfigurationseinstellungen gesteuert werden.

### Welche Daten werden erfasst

Wenn aktiviert, kann Qwen Code Folgendes erfassen:

- Anonyme Nutzungsstatistiken (ausgeführte Befehle, Leistungskennzahlen)
- Fehlerberichte und Absturzdaten
- Nutzungsmuster von Funktionen

### Datenerfassung nach Authentifizierungsmethode

- **Qwen OAuth:** Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Qwen. Sie können die Erfassung über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **Alibaba Cloud Coding Plan:** Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Alibaba Cloud. Sie können die Erfassung über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **API Key:** Es werden keine zusätzlichen Daten von Qwen Code erfasst, über das hinaus, was Ihr gewählter API-Anbieter erfasst.
- **Vertex AI:** Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Google Cloud. Es werden keine zusätzlichen Daten von Qwen Code erfasst, über das hinaus, was Google Cloud erfasst.

## Häufig gestellte Fragen (FAQ)

### 1. Werden mein Code, einschließlich Prompts und Antworten, zum Trainieren von KI-Modellen verwendet?

Ob Ihr Code, einschließlich Prompts und Antworten, zum Trainieren von KI-Modellen verwendet wird, hängt von Ihrer Authentifizierungsmethode und dem spezifischen KI-Dienstanbieter ab:

- **Qwen OAuth**: Die Datennutzung unterliegt der [Datenschutzrichtlinie von Qwen](https://qwen.ai/privacypolicy). Bitte lesen Sie deren Richtlinie für spezifische Details zur Datenerfassung und Modelltrainingspraktiken.

- **Alibaba Cloud Coding Plan**: Die Datennutzung unterliegt der Datenschutzrichtlinie von Alibaba Cloud. Bitte lesen Sie deren Richtlinie für spezifische Details zur Datenerfassung und Modelltrainingspraktiken.

- **API Key**: Die Datennutzung hängt vollständig von Ihrem gewählten API-Anbieter ab. Jeder Anbieter hat seine eigenen Richtlinien zur Datennutzung. Bitte lesen Sie die Datenschutzrichtlinie und Nutzungsbedingungen Ihres spezifischen Anbieters.

- **Vertex AI**: Die Datennutzung unterliegt den [Nutzungsbedingungen von Google Cloud](https://cloud.google.com/terms) und der [Datenschutzerklärung](https://cloud.google.com/privacy). Bitte lesen Sie die Richtlinien von Google Cloud für spezifische Details zur Datenerfassung und Modelltrainingspraktiken.

**Wichtig**: Qwen Code selbst verwendet Ihre Prompts, Ihren Code oder Ihre Antworten nicht für das Modelltraining. Eine Datennutzung zu Trainingszwecken unterliegt den Richtlinien des KI-Dienstanbieters, bei dem Sie sich authentifizieren.

### 2. Was sind Nutzungsstatistiken und was steuert die Opt-out-Funktion?

Die Einstellung **Nutzungsstatistiken** steuert die optionale Datenerfassung durch Qwen Code zur Verbesserung der Benutzererfahrung und Produktqualität.

Wenn aktiviert, kann Qwen Code Folgendes erfassen:

- Anonyme Telemetrie (ausgeführte Befehle, Leistungskennzahlen, Funktionsnutzung)
- Fehlerberichte und Absturzdaten
- Allgemeine Nutzungsmuster

**Was NICHT von Qwen Code erfasst wird:**

- Ihr Code-Inhalt
- An KI-Modelle gesendete Prompts
- Antworten von KI-Modellen
- Persönliche Informationen

Die Einstellung Nutzungsstatistiken steuert nur die Datenerfassung durch Qwen Code selbst. Sie hat keinen Einfluss darauf, welche Daten Ihr gewählter KI-Dienstanbieter (Qwen, OpenAI, etc.) gemäß seinen eigenen Datenschutzrichtlinien erfassen darf.

### 3. Wie wechsle ich zwischen den Authentifizierungsmethoden?

Sie können jederzeit zwischen Qwen OAuth, Alibaba Cloud Coding Plan, Ihrem eigenen API-Key und Vertex AI wechseln:

1. **Während des Starts**: Wählen Sie Ihre bevorzugte Authentifizierungsmethode, wenn Sie dazu aufgefordert werden
2. **Innerhalb der CLI**: Verwenden Sie den Befehl `/auth`, um Ihre Authentifizierungsmethode neu zu konfigurieren
3. **Umgebungsvariablen**: Richten Sie `.env`-Dateien für die automatische API-Key-Authentifizierung ein

Eine detaillierte Anleitung finden Sie in der Dokumentation [Authentifizierung einrichten](../configuration/auth.md).