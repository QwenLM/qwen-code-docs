# Qwen Code: Nutzungsbedingungen und Datenschutzerklärung

Qwen Code ist ein Open-Source-KI-Coding-Assistent, der vom Qwen Code-Team betrieben wird. Dieses Dokument beschreibt die Nutzungsbedingungen und Datenschutzrichtlinien, die bei der Verwendung der Authentifizierungsmethoden und KI-Modelldienste von Qwen Code gelten.

## So ermitteln Sie Ihre Authentifizierungsmethode

Qwen Code unterstützt drei Authentifizierungsmethoden für den Zugriff auf KI-Modelle. Ihre Authentifizierungsmethode bestimmt, welche Nutzungsbedingungen und Datenschutzrichtlinien für Ihre Nutzung gelten:

1. **Qwen OAuth** – Melden Sie sich mit Ihrem qwen.ai-Konto an (kostenloser Stufen eingestellt am 15.04.2026)
2. **Alibaba Cloud Coding Plan** – Verwenden Sie einen API-Schlüssel von Alibaba Cloud
3. **API-Schlüssel** – Bringen Sie Ihren eigenen API-Schlüssel mit

Für jede Authentifizierungsmethode können je nach zugrunde liegendem Dienstanbieter unterschiedliche Nutzungsbedingungen und Datenschutzerklärungen gelten.

| Authentifizierungsmethode | Anbieter          | Nutzungsbedingungen                                                   | Datenschutzerklärung                                                     |
| :------------------------ | :---------------- | :--------------------------------------------------------------------- | :----------------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Nutzungsbedingungen](https://qwen.ai/termsservice)               | [Qwen Datenschutzrichtlinie](https://qwen.ai/privacypolicy)              |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | Siehe [Details unten](#2-wenn-sie-den-alibaba-cloud-coding-plan-verwenden) | Siehe [Details unten](#2-wenn-sie-den-alibaba-cloud-coding-plan-verwenden) |
| API-Schlüssel             | Verschiedene Anbieter | Hängt vom gewählten API-Anbieter ab (OpenAI, Anthropic, usw.)          | Hängt vom gewählten API-Anbieter ab                                      |

## 1. Wenn Sie die Qwen OAuth-Authentifizierung verwenden

Wenn Sie sich mit Ihrem qwen.ai-Konto authentifizieren, gelten diese Nutzungsbedingungen und diese Datenschutzerklärung:

- **Nutzungsbedingungen:** Ihre Nutzung unterliegt den [Qwen Nutzungsbedingungen](https://qwen.ai/termsservice).
- **Datenschutzerklärung:** Die Erhebung und Nutzung Ihrer Daten wird in der [Qwen Datenschutzrichtlinie](https://qwen.ai/privacypolicy) beschrieben.

Details zur Einrichtung der Authentifizierung, Kontingenten und unterstützten Funktionen finden Sie unter [Authentifizierungseinrichtung](../configuration/settings).

## 2. Wenn Sie den Alibaba Cloud Coding Plan verwenden

Wenn Sie sich mit einem API-Schlüssel von Alibaba Cloud authentifizieren, gelten die entsprechenden Nutzungsbedingungen und die Datenschutzerklärung von Alibaba Cloud.

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Wenn Sie den Alibaba Cloud Coding Plan verwenden, unterliegen Sie den Bedingungen und Datenschutzrichtlinien von Alibaba Cloud. Bitte lesen Sie deren Dokumentation für spezifische Details zur Datennutzung, -speicherung und zu Datenschutzpraktiken.

## 3. Wenn Sie Ihren eigenen API-Schlüssel verwenden

Wenn Sie sich mit API-Schlüsseln von anderen Anbietern authentifizieren, hängen die geltenden Nutzungsbedingungen und Datenschutzerklärungen von Ihrem gewählten Anbieter ab.

> [!important]
>
> Wenn Sie Ihren eigenen API-Schlüssel verwenden, unterliegen Sie den Bedingungen und Datenschutzrichtlinien Ihres gewählten API-Anbieters, nicht den Bedingungen von Qwen Code. Bitte lesen Sie die Dokumentation Ihres Anbieters für spezifische Details zur Datennutzung, -speicherung und zu Datenschutzpraktiken.

Qwen Code unterstützt verschiedene OpenAI-kompatible Anbieter. Bitte beachten Sie die Nutzungsbedingungen und Datenschutzrichtlinien Ihres spezifischen Anbieters für detaillierte Informationen.

## Nutzungsstatistiken und Telemetrie

Qwen Code kann anonyme Nutzungsstatistiken und [Telemetriedaten](../../developers/development/telemetry) erfassen, um die Benutzererfahrung und Produktqualität zu verbessern. Diese Datenerfassung ist optional und kann über Konfigurationseinstellungen gesteuert werden.

### Welche Daten werden erfasst

Wenn aktiviert, kann Qwen Code Folgendes erfassen:

- Anonyme Nutzungsstatistiken (ausgeführte Befehle, Leistungsmetriken)
- Fehlerberichte und Absturzdaten
- Nutzungsmuster von Funktionen

### Datenerfassung nach Authentifizierungsmethode

- **Qwen OAuth:** Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Qwen. Sie können über die Konfigurationseinstellungen von Qwen Code widersprechen.
- **Alibaba Cloud Coding Plan:** Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Alibaba Cloud. Sie können über die Konfigurationseinstellungen von Qwen Code widersprechen.
- **API-Schlüssel:** Es werden keine zusätzlichen Daten von Qwen Code erfasst, über das hinaus, was Ihr gewählter API-Anbieter erfasst.

## Häufig gestellte Fragen (FAQ)

### 1. Wird mein Code, einschließlich Eingabeaufforderungen und Antworten, zum Trainieren von KI-Modellen verwendet?

Ob Ihr Code, einschließlich Eingabeaufforderungen und Antworten, zum Trainieren von KI-Modellen verwendet wird, hängt von Ihrer Authentifizierungsmethode und dem jeweiligen KI-Dienstanbieter ab:

- **Qwen OAuth**: Die Datennutzung unterliegt der [Datenschutzrichtlinie von Qwen](https://qwen.ai/privacy). Bitte lesen Sie deren Richtlinie für spezifische Details zur Datenerfassung und Modelltrainingspraktiken.

- **Alibaba Cloud Coding Plan**: Die Datennutzung unterliegt der Datenschutzrichtlinie von Alibaba Cloud. Bitte lesen Sie deren Richtlinie für spezifische Details zur Datenerfassung und Modelltrainingspraktiken.
- **API-Key**: Die Datennutzung hängt vollständig von Ihrem gewählten API-Anbieter ab. Jeder Anbieter hat seine eigenen Richtlinien zur Datennutzung. Bitte lesen Sie die Datenschutzbestimmungen und Nutzungsbedingungen Ihres spezifischen Anbieters.

**Wichtig**: Qwen Code selbst verwendet Ihre Prompts, Ihren Code oder Ihre Antworten nicht für das Modelltraining. Eine Nutzung von Daten zu Trainingszwecken würde durch die Richtlinien des KI-Dienstanbieters geregelt, bei dem Sie sich authentifizieren.

### 2. Was sind Nutzungsstatistiken und was steuert die Opt-out-Funktion?

Die Einstellung **Nutzungsstatistiken** steuert die optionale Datenerfassung durch Qwen Code zur Verbesserung der Benutzererfahrung und Produktqualität.

Wenn aktiviert, kann Qwen Code Folgendes erfassen:

- Anonyme Telemetrie (ausgeführte Befehle, Leistungskennzahlen, Nutzung von Funktionen)
- Fehlerberichte und Absturzdaten
- Allgemeine Nutzungsmuster

**Was NICHT von Qwen Code erfasst wird:**

- Ihr Codeinhalt
- An KI-Modelle gesendete Prompts
- Antworten von KI-Modellen
- Persönliche Informationen

Die Einstellung für Nutzungsstatistiken steuert nur die Datenerfassung durch Qwen Code selbst. Sie hat keinen Einfluss darauf, welche Daten Ihr gewählter KI-Dienstanbieter (Qwen, OpenAI usw.) gemäß seinen eigenen Datenschutzrichtlinien erheben darf.

### 3. Wie wechsle ich zwischen den Authentifizierungsmethoden?

Sie können jederzeit zwischen Qwen OAuth, Alibaba Cloud Coding Plan und Ihrem eigenen API-Key wechseln:

1. **Beim Start**: Wählen Sie die gewünschte Authentifizierungsmethode, wenn Sie dazu aufgefordert werden
2. **In der CLI**: Verwenden Sie den Befehl `/auth`, um Ihre Authentifizierungsmethode neu zu konfigurieren
3. **Umgebungsvariablen**: Richten Sie `.env`-Dateien für die automatische API-Key-Authentifizierung ein

Detaillierte Anweisungen finden Sie in der Dokumentation [Authentifizierung einrichten](../configuration/auth.md).
