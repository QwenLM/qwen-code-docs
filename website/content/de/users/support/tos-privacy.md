# Qwen Code: Nutzungsbedingungen und Datenschutzhinweis

Qwen Code ist ein Open-Source-KI-Coding-Assistent, der vom Qwen Code-Team gepflegt wird. Dieses Dokument beschreibt die Nutzungsbedingungen und Datenschutzrichtlinien, die bei der Verwendung der Authentifizierungsmethoden und KI-Modell-Services von Qwen Code gelten.

## So ermitteln Sie Ihre Authentifizierungsmethode

Qwen Code unterstützt drei Authentifizierungsmethoden für den Zugriff auf KI-Modelle. Ihre gewählte Methode bestimmt, welche Nutzungsbedingungen und Datenschutzrichtlinien für Ihre Nutzung gelten:

1. **Qwen OAuth** — Anmeldung mit Ihrem qwen.ai-Konto (Free-Tier wird am 15.04.2026 eingestellt)
2. **Alibaba Cloud Coding Plan** — Verwendung eines API-Keys von Alibaba Cloud
3. **API Key** — Nutzung Ihres eigenen API-Keys

Je nach Authentifizierungsmethode und zugrunde liegendem Service-Provider können unterschiedliche Nutzungsbedingungen und Datenschutzhinweise gelten.

| Authentifizierungsmethode     | Provider          | Nutzungsbedingungen                                                   | Datenschutzhinweis                                                     |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Terms of Service](https://qwen.ai/termsservice)              | [Qwen Privacy Policy](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan) | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | Verschiedene Provider | Abhängig von Ihrem gewählten API-Provider (OpenAI, Anthropic usw.)      | Abhängig von Ihrem gewählten API-Provider                                |

## 1. Wenn Sie Qwen OAuth verwenden

Wenn Sie sich mit Ihrem qwen.ai-Konto authentifizieren, gelten folgende Dokumente:

- **Nutzungsbedingungen:** Ihre Nutzung unterliegt den [Qwen Terms of Service](https://qwen.ai/termsservice).
- **Datenschutzhinweis:** Die Erhebung und Nutzung Ihrer Daten ist in der [Qwen Privacy Policy](https://qwen.ai/privacypolicy) beschrieben.

Details zur Einrichtung der Authentifizierung, zu Kontingenten und unterstützten Funktionen finden Sie unter [Authentication Setup](../configuration/settings).

## 2. Wenn Sie den Alibaba Cloud Coding Plan verwenden

Wenn Sie sich mit einem API-Key von Alibaba Cloud authentifizieren, gelten die entsprechenden Nutzungsbedingungen und Datenschutzhinweise von Alibaba Cloud.

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Bei der Nutzung des Alibaba Cloud Coding Plans unterliegen Sie den Nutzungsbedingungen und Datenschutzrichtlinien von Alibaba Cloud. Bitte prüfen Sie deren Dokumentation für spezifische Details zur Datennutzung, -speicherung und zu den Datenschutzpraktiken.

## 3. Wenn Sie Ihren eigenen API-Key verwenden

Wenn Sie sich mit API-Keys anderer Provider authentifizieren, hängen die geltenden Nutzungsbedingungen und Datenschutzhinweise von Ihrem gewählten Provider ab.

> [!important]
>
> Bei der Nutzung Ihres eigenen API-Keys unterliegen Sie den Nutzungsbedingungen und Datenschutzrichtlinien Ihres gewählten API-Providers, nicht denen von Qwen Code. Bitte prüfen Sie die Dokumentation Ihres Providers für spezifische Details zur Datennutzung, -speicherung und zu den Datenschutzpraktiken.

Qwen Code unterstützt verschiedene OpenAI-kompatible Provider. Für detaillierte Informationen konsultieren Sie bitte die Nutzungsbedingungen und Datenschutzrichtlinien Ihres jeweiligen Providers.

## Nutzungsstatistiken und Telemetrie

Qwen Code kann anonyme Nutzungsstatistiken und [Telemetrie](../../developers/development/telemetry)-Daten erfassen, um die Benutzererfahrung und Produktqualität zu verbessern. Diese Datenerfassung ist optional und kann über die Konfigurationseinstellungen gesteuert werden.

### Welche Daten werden erfasst

Wenn aktiviert, kann Qwen Code Folgendes erfassen:

- Anonyme Nutzungsstatistiken (ausgeführte Befehle, Leistungsmetriken)
- Fehlerberichte und Absturzdaten
- Nutzungsmuster von Funktionen

### Datenerfassung nach Authentifizierungsmethode

- **Qwen OAuth:** Die Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Qwen. Sie können der Erfassung über die Konfigurationseinstellungen von Qwen Code widersprechen (Opt-out).
- **Alibaba Cloud Coding Plan:** Die Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Alibaba Cloud. Sie können der Erfassung über die Konfigurationseinstellungen von Qwen Code widersprechen (Opt-out).
- **API Key:** Qwen Code erfasst keine zusätzlichen Daten über das hinaus, was Ihr gewählter API-Provider erhebt.

## Häufig gestellte Fragen (FAQ)

### 1. Wird mein Code, einschließlich Prompts und Antworten, zum Trainieren von KI-Modellen verwendet?

Ob Ihr Code, einschließlich Prompts und Antworten, zum Trainieren von KI-Modellen verwendet wird, hängt von Ihrer Authentifizierungsmethode und dem jeweiligen KI-Service-Provider ab:

- **Qwen OAuth**: Die Datennutzung unterliegt der [Qwen Privacy Policy](https://qwen.ai/privacy). Bitte entnehmen Sie dieser Richtlinie spezifische Details zur Datenerfassung und zu den Praktiken des Modelltrainings.

- **Alibaba Cloud Coding Plan**: Die Datennutzung unterliegt der Datenschutzrichtlinie von Alibaba Cloud. Bitte entnehmen Sie dieser Richtlinie spezifische Details zur Datenerfassung und zu den Praktiken des Modelltrainings.

- **API Key**: Die Datennutzung hängt vollständig von Ihrem gewählten API-Provider ab. Jeder Provider hat eigene Richtlinien zur Datennutzung. Bitte prüfen Sie die Datenschutzrichtlinie und die Nutzungsbedingungen Ihres jeweiligen Providers.

**Wichtig**: Qwen Code selbst verwendet Ihre Prompts, Ihren Code oder Ihre Antworten nicht zum Modelltraining. Jegliche Datennutzung zu Trainingszwecken unterliegt den Richtlinien des KI-Service-Providers, mit dem Sie sich authentifizieren.

### 2. Was sind Nutzungsstatistiken und was steuert die Opt-out-Funktion?

Die Einstellung **Usage Statistics** steuert die optionale Datenerfassung durch Qwen Code zur Verbesserung der Benutzererfahrung und Produktqualität.

Wenn aktiviert, kann Qwen Code Folgendes erfassen:

- Anonyme Telemetrie (ausgeführte Befehle, Leistungsmetriken, Funktionsnutzung)
- Fehlerberichte und Absturzdaten
- Allgemeine Nutzungsmuster

**Was von Qwen Code NICHT erfasst wird:**

- Ihr Code-Inhalt
- An KI-Modelle gesendete Prompts
- Antworten von KI-Modellen
- Persönliche Informationen

Die Einstellung Usage Statistics steuert ausschließlich die Datenerfassung durch Qwen Code selbst. Sie hat keinen Einfluss darauf, welche Daten Ihr gewählter KI-Service-Provider (Qwen, OpenAI usw.) gemäß seinen eigenen Datenschutzrichtlinien erhebt.

### 3. Wie wechsle ich zwischen Authentifizierungsmethoden?

Sie können jederzeit zwischen Qwen OAuth, Alibaba Cloud Coding Plan und Ihrem eigenen API-Key wechseln:

1. **Beim Start**: Wählen Sie Ihre bevorzugte Authentifizierungsmethode, wenn Sie dazu aufgefordert werden
2. **In der CLI**: Verwenden Sie den Befehl `/auth`, um Ihre Authentifizierungsmethode neu zu konfigurieren
3. **Umgebungsvariablen**: Richten Sie `.env`-Dateien für die automatische API-Key-Authentifizierung ein

Detaillierte Anweisungen finden Sie in der Dokumentation zu [Authentication Setup](../configuration/settings#environment-variables-for-api-access).