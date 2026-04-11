# Qwen Code: Nutzungsbedingungen und Datenschutzhinweise

Qwen Code ist ein Open-Source-KI-Coding-Assistent, der vom Qwen Code-Team gepflegt wird. Dieses Dokument beschreibt die Nutzungsbedingungen und Datenschutzrichtlinien, die bei der Verwendung der Authentifizierungsmethoden und KI-Modell-Dienste von Qwen Code gelten.

## So ermitteln Sie Ihre Authentifizierungsmethode

Qwen Code unterstützt drei Authentifizierungsmethoden für den Zugriff auf KI-Modelle. Ihre gewählte Methode bestimmt, welche Nutzungsbedingungen und Datenschutzrichtlinien für Ihre Nutzung gelten:

1. **Qwen OAuth** — Anmeldung mit Ihrem qwen.ai-Konto (kostenloses tägliches Kontingent)
2. **Alibaba Cloud Coding Plan** — Verwendung eines API-Keys von Alibaba Cloud
3. **API Key** — Nutzung eines eigenen API-Keys

Je nach Authentifizierungsmethode und zugrundeliegendem Dienstanbieter können unterschiedliche Nutzungsbedingungen und Datenschutzhinweise gelten.

| Authentifizierungsmethode | Anbieter          | Nutzungsbedingungen                                                | Datenschutzhinweise                                                |
| :------------------------ | :---------------- | :----------------------------------------------------------------- | :----------------------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Terms of Service](https://qwen.ai/termsservice)              | [Qwen Privacy Policy](https://qwen.ai/privacypolicy)               |
| Alibaba Cloud Coding Plan | Alibaba Cloud     | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan) | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan) |
| API Key                   | Verschiedene Anbieter | Hängt von Ihrem gewählten API-Anbieter ab (OpenAI, Anthropic usw.) | Hängt von Ihrem gewählten API-Anbieter ab                          |

## 1. Wenn Sie Qwen OAuth verwenden

Wenn Sie sich mit Ihrem qwen.ai-Konto authentifizieren, gelten folgende Dokumente zu Nutzungsbedingungen und Datenschutz:

- **Nutzungsbedingungen:** Ihre Nutzung unterliegt den [Qwen Terms of Service](https://qwen.ai/termsservice).
- **Datenschutzhinweise:** Die Erhebung und Nutzung Ihrer Daten ist in der [Qwen Privacy Policy](https://qwen.ai/privacypolicy) beschrieben.

Details zur Authentifizierungseinrichtung, Kontingenten und unterstützten Funktionen finden Sie unter [Authentication Setup](../configuration/settings).

## 2. Wenn Sie den Alibaba Cloud Coding Plan verwenden

Wenn Sie sich mit einem API-Key von Alibaba Cloud authentifizieren, gelten die entsprechenden Nutzungsbedingungen und Datenschutzhinweise von Alibaba Cloud.

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Bei der Nutzung des Alibaba Cloud Coding Plan unterliegen Sie den Nutzungsbedingungen und Datenschutzrichtlinien von Alibaba Cloud. Bitte lesen Sie deren Dokumentation für spezifische Details zur Datennutzung, -speicherung und zu den Datenschutzpraktiken.

## 3. Wenn Sie einen eigenen API Key verwenden

Wenn Sie sich mit API-Keys anderer Anbieter authentifizieren, hängen die geltenden Nutzungsbedingungen und Datenschutzhinweise von Ihrem gewählten Anbieter ab.

> [!important]
>
> Bei der Verwendung eines eigenen API-Keys unterliegen Sie den Nutzungsbedingungen und Datenschutzrichtlinien Ihres gewählten API-Anbieters, nicht denen von Qwen Code. Bitte lesen Sie die Dokumentation Ihres Anbieters für spezifische Details zur Datennutzung, -speicherung und zu den Datenschutzpraktiken.

Qwen Code unterstützt verschiedene OpenAI-kompatible Anbieter. Detaillierte Informationen entnehmen Sie bitte den Nutzungsbedingungen und der Datenschutzrichtlinie Ihres jeweiligen Anbieters.

## Nutzungsstatistiken und Telemetrie

Qwen Code kann anonyme Nutzungsstatistiken und [Telemetrie](../../developers/development/telemetry)-Daten erheben, um die Benutzererfahrung und Produktqualität zu verbessern. Diese Datenerhebung ist optional und kann über die Konfigurationseinstellungen gesteuert werden.

### Welche Daten werden erhoben

Wenn aktiviert, kann Qwen Code Folgendes erheben:

- Anonyme Nutzungsstatistiken (ausgeführte Befehle, Leistungsmetriken)
- Fehlerberichte und Absturzdaten
- Nutzungsmuster von Funktionen

### Datenerhebung nach Authentifizierungsmethode

- **Qwen OAuth:** Die Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Qwen. Sie können die Erhebung über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **Alibaba Cloud Coding Plan:** Die Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Alibaba Cloud. Sie können die Erhebung über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **API Key:** Qwen Code erhebt keine zusätzlichen Daten über das hinaus, was Ihr gewählter API-Anbieter erhebt.

## Häufig gestellte Fragen (FAQ)

### 1. Wird mein Code, einschließlich Prompts und Antworten, zum Trainieren von KI-Modellen verwendet?

Ob Ihr Code, einschließlich Prompts und Antworten, zum Trainieren von KI-Modellen verwendet wird, hängt von Ihrer Authentifizierungsmethode und dem jeweiligen KI-Dienstanbieter ab:

- **Qwen OAuth**: Die Datennutzung unterliegt der [Qwen Privacy Policy](https://qwen.ai/privacy). Spezifische Details zur Datenerhebung und zu den Praktiken des Modelltrainings entnehmen Sie bitte deren Richtlinie.

- **Alibaba Cloud Coding Plan**: Die Datennutzung unterliegt der Datenschutzrichtlinie von Alibaba Cloud. Spezifische Details zur Datenerhebung und zu den Praktiken des Modelltrainings entnehmen Sie bitte deren Richtlinie.

- **API Key**: Die Datennutzung hängt vollständig von Ihrem gewählten API-Anbieter ab. Jeder Anbieter hat eigene Richtlinien zur Datennutzung. Bitte prüfen Sie die Datenschutzrichtlinie und die Nutzungsbedingungen Ihres jeweiligen Anbieters.

**Wichtig**: Qwen Code selbst verwendet Ihre Prompts, Ihren Code oder Ihre Antworten nicht zum Modelltraining. Eine Datennutzung zu Trainingszwecken unterliegt ausschließlich den Richtlinien des KI-Dienstanbieters, mit dem Sie sich authentifizieren.

### 2. Was sind Nutzungsstatistiken und was steuert die Opt-out-Einstellung?

Die Einstellung **Usage Statistics** steuert die optionale Datenerhebung durch Qwen Code zur Verbesserung der Benutzererfahrung und Produktqualität.

Wenn aktiviert, kann Qwen Code Folgendes erheben:

- Anonyme Telemetriedaten (ausgeführte Befehle, Leistungsmetriken, Funktionsnutzung)
- Fehlerberichte und Absturzdaten
- Allgemeine Nutzungsmuster

**Was von Qwen Code NICHT erhoben wird:**

- Ihr Code-Inhalt
- An KI-Modelle gesendete Prompts
- Antworten von KI-Modellen
- Persönliche Informationen

Die Einstellung Usage Statistics steuert ausschließlich die Datenerhebung durch Qwen Code selbst. Sie hat keinen Einfluss darauf, welche Daten Ihr gewählter KI-Dienstanbieter (Qwen, OpenAI usw.) gemäß dessen eigenen Datenschutzrichtlinien erheben darf.

### 3. Wie wechsle ich zwischen Authentifizierungsmethoden?

Sie können jederzeit zwischen Qwen OAuth, Alibaba Cloud Coding Plan und einem eigenen API Key wechseln:

1. **Beim Start**: Wählen Sie Ihre bevorzugte Authentifizierungsmethode, wenn Sie dazu aufgefordert werden
2. **In der CLI**: Verwenden Sie den Befehl `/auth`, um Ihre Authentifizierungsmethode neu zu konfigurieren
3. **Umgebungsvariablen**: Richten Sie `.env`-Dateien für die automatische API-Key-Authentifizierung ein

Detaillierte Anweisungen finden Sie in der Dokumentation zu [Authentication Setup](../configuration/settings#environment-variables-for-api-access).