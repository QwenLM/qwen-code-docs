# Qwen Code: Allgemeine Geschäftsbedingungen und Datenschutzhinweis

Qwen Code ist ein quelloffenes KI-Tool zur Unterstützung bei der Programmierung, das vom Qwen-Code-Team gepflegt wird. Dieses Dokument beschreibt die Allgemeinen Geschäftsbedingungen und Datenschutzrichtlinien, die bei der Nutzung der Authentifizierungsmethoden und KI-Modell-Dienste von Qwen Code gelten.

## So ermitteln Sie Ihre Authentifizierungsmethode

Qwen Code unterstützt drei Authentifizierungsmethoden für den Zugriff auf KI-Modelle. Ihre gewählte Authentifizierungsmethode bestimmt, welche Allgemeinen Geschäftsbedingungen und Datenschutzrichtlinien für Ihre Nutzung gelten:

1. **Qwen OAuth** – Melden Sie sich mit Ihrem qwen.ai-Konto an (kostenloses tägliches Kontingent)
2. **Alibaba Cloud Coding Plan** – Verwenden Sie einen API-Schlüssel von Alibaba Cloud
3. **API-Schlüssel** – Verwenden Sie Ihren eigenen API-Schlüssel

Für jede Authentifizierungsmethode können je nach zugrunde liegendem Dienstanbieter unterschiedliche Allgemeine Geschäftsbedingungen und Datenschutzhinweise gelten.

| Authentifizierungsmethode     | Anbieter          | Allgemeine Geschäftsbedingungen                                                   | Datenschutzhinweis                                                     |
| :---------------------------- | :---------------- | :------------------------------------------------------------------------------- | :--------------------------------------------------------------------- |
| Qwen OAuth                    | Qwen AI           | [Allgemeine Geschäftsbedingungen von Qwen](https://qwen.ai/termsservice)         | [Datenschutzrichtlinie von Qwen](https://qwen.ai/privacypolicy)        |
| Alibaba Cloud Coding Plan     | Alibaba Cloud     | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan)            | Siehe [Details unten](#2-if-you-are-using-alibaba-cloud-coding-plan)  |
| API-Schlüssel                 | Verschiedene Anbieter | Hängt vom gewählten API-Anbieter ab (OpenAI, Anthropic usw.)                   | Hängt vom gewählten API-Anbieter ab                                    |

## 1. Wenn Sie die Qwen-OAuth-Authentifizierung verwenden

Wenn Sie sich mit Ihrem qwen.ai-Konto authentifizieren, gelten folgende Dokumente:

- **Nutzungsbedingungen:** Ihre Nutzung unterliegt den [Nutzungsbedingungen von Qwen](https://qwen.ai/termsservice).
- **Datenschutzhinweis:** Die Erhebung und Verwendung Ihrer Daten ist in der [Datenschutzrichtlinie von Qwen](https://qwen.ai/privacypolicy) beschrieben.

Weitere Informationen zur Einrichtung der Authentifizierung, zu Kontingenten und zu unterstützten Funktionen finden Sie unter [Einrichtung der Authentifizierung](../configuration/settings).

## 2. Wenn Sie den Alibaba Cloud Coding Plan verwenden

Wenn Sie sich mit einem API-Schlüssel von Alibaba Cloud authentifizieren, gelten die jeweiligen Allgemeinen Geschäftsbedingungen und die Datenschutzerklärung von Alibaba Cloud.

Der Alibaba Cloud Coding Plan ist in zwei Regionen verfügbar:

- **阿里云百炼 (aliyun.com)** — [bailian.console.aliyun.com](https://bailian.console.aliyun.com)  
- **Alibaba Cloud (alibabacloud.com)** — [bailian.console.alibabacloud.com](https://bailian.console.alibabacloud.com)

> [!important]
>
> Bei der Nutzung des Alibaba Cloud Coding Plans unterliegen Sie den Allgemeinen Geschäftsbedingungen und Datenschutzrichtlinien von Alibaba Cloud. Bitte lesen Sie deren Dokumentation, um detaillierte Informationen zu Datenverwendung, -speicherung und -schutzpraktiken zu erhalten.

## 3. Wenn Sie Ihren eigenen API-Schlüssel verwenden

Wenn Sie sich mit API-Schlüsseln anderer Anbieter authentifizieren, gelten die jeweiligen Allgemeinen Geschäftsbedingungen und Datenschutzhinweise Ihres gewählten Anbieters.

> [!important]
>
> Bei Verwendung Ihres eigenen API-Schlüssels unterliegen Sie den Geschäftsbedingungen und Datenschutzrichtlinien Ihres gewählten API-Anbieters – nicht den Bedingungen von Qwen Code. Bitte lesen Sie die Dokumentation Ihres Anbieters, um Einzelheiten zu Datenverwendung, -speicherung und -schutzpraktiken zu erfahren.

Qwen Code unterstützt verschiedene OpenAI-kompatible Anbieter. Für detaillierte Informationen wenden Sie sich bitte an die Allgemeinen Geschäftsbedingungen und die Datenschutzrichtlinie Ihres spezifischen Anbieters.

## Nutzungsstatistiken und Telemetriedaten

Qwen Code kann anonymisierte Nutzungsstatistiken und [Telemetriedaten](../../developers/development/telemetry) sammeln, um die Benutzererfahrung und die Produktqualität zu verbessern. Diese Datenerhebung ist optional und kann über Konfigurationseinstellungen gesteuert werden.

### Welche Daten werden erhoben?

Wenn aktiviert, kann Qwen Code folgende Daten erfassen:

- Anonyme Nutzungsstatistiken (ausgeführte Befehle, Leistungsmetriken)
- Fehlerberichte und Absturzdaten
- Nutzungsmuster von Funktionen

### Datenerhebung nach Authentifizierungsmethode

- **Qwen-OAuth:** Die Nutzungstatistiken unterliegen der Datenschutzrichtlinie von Qwen. Sie können diese über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **Alibaba Cloud Coding-Plan:** Die Nutzungstatistiken unterliegen der Datenschutzrichtlinie von Alibaba Cloud. Sie können diese über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **API-Schlüssel:** Qwen Code erhebt keine weiteren Daten über das hinaus, was Ihr gewählter API-Anbieter bereits erfasst.

## Häufig gestellte Fragen (FAQ)

### 1. Wird mein Code – inklusive Prompts und Antworten – zur Schulung von KI-Modellen verwendet?

Ob Ihr Code, einschließlich Prompts und Antworten, zur Schulung von KI-Modellen verwendet wird, hängt von Ihrer Authentifizierungsmethode und dem jeweiligen Anbieter des KI-Dienstes ab:

- **Qwen-OAuth**: Die Nutzung Ihrer Daten richtet sich nach der [Datenschutzrichtlinie von Qwen](https://qwen.ai/privacy). Weitere Einzelheiten zu Datenerhebung und Modelltrainingspraktiken finden Sie in deren Richtlinie.

- **Alibaba Cloud-Coding-Plan**: Die Nutzung Ihrer Daten richtet sich nach der Datenschutzrichtlinie von Alibaba Cloud. Weitere Einzelheiten zu Datenerhebung und Modelltrainingspraktiken finden Sie in deren Richtlinie.

- **API-Schlüssel**: Die Nutzung Ihrer Daten hängt vollständig vom gewählten API-Anbieter ab. Jeder Anbieter verfolgt eigene Richtlinien zur Datenverwendung. Bitte prüfen Sie die Datenschutzrichtlinie und die Allgemeinen Geschäftsbedingungen Ihres konkreten Anbieters.

**Wichtig**: Qwen Code selbst verwendet Ihre Prompts, Ihren Code oder Ihre Antworten nicht für das Training von Modellen. Sollte eine Datenverwendung zum Zweck des Modelltrainings erfolgen, unterliegt diese ausschließlich den Richtlinien des KI-Dienstanbieters, mit dem Sie sich authentifizieren.

### 2. Was sind Nutzungsstatistiken und was steuert die Opt-out-Einstellung?

Die Einstellung **Nutzungsstatistiken** steuert die optionale Datenerfassung durch Qwen Code zur Verbesserung der Benutzererfahrung und der Produktqualität.

Wenn diese Einstellung aktiviert ist, kann Qwen Code folgende Daten erfassen:

- Anonyme Telemetriedaten (ausgeführte Befehle, Leistungsmetriken, Nutzung von Funktionen)
- Fehlerberichte und Absturzdaten
- Allgemeine Nutzungsmuster

**Was Qwen Code NICHT erfasst:**

- Ihren Quellcode
- An die KI-Modelle gesendete Prompts
- Antworten der KI-Modelle
- Persönliche Informationen

Die Einstellung „Nutzungsstatistiken“ steuert ausschließlich die Datenerfassung durch Qwen Code selbst. Sie hat keinerlei Einfluss darauf, welche Daten Ihr gewählter KI-Dienstanbieter (z. B. Qwen, OpenAI usw.) gemäß seiner eigenen Datenschutzrichtlinien erheben darf.

### 3. Wie wechsle ich zwischen Authentifizierungsmethoden?

Sie können jederzeit zwischen Qwen-OAuth, dem Alibaba Cloud Coding-Plan und Ihrem eigenen API-Schlüssel wechseln:

1. **Beim Start**: Wählen Sie Ihre bevorzugte Authentifizierungsmethode bei der entsprechenden Aufforderung aus  
2. **Innerhalb der CLI**: Verwenden Sie den Befehl `/auth`, um Ihre Authentifizierungsmethode neu zu konfigurieren  
3. **Umgebungsvariablen**: Richten Sie `.env`-Dateien für eine automatische Authentifizierung mit dem API-Schlüssel ein  

Ausführliche Anweisungen finden Sie in der Dokumentation zur [Einrichtung der Authentifizierung](../configuration/settings#environment-variables-for-api-access).