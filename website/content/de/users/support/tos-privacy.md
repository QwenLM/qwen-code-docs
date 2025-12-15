# Qwen Code: Nutzungsbedingungen und Datenschutzhinweise

Qwen Code ist ein Open-Source-KI-Coding-Assistenten-Tool, das vom Qwen Code-Team betreut wird. Dieses Dokument legt die Nutzungsbedingungen und Datenschutzrichtlinien dar, die bei der Verwendung der Authentifizierungsmethoden und KI-Modell-Dienste von Qwen Code gelten.

## So ermitteln Sie Ihre Authentifizierungsmethode

Qwen Code unterstützt zwei Hauptauthentifizierungsmethoden für den Zugriff auf KI-Modelle. Ihre Authentifizierungsmethode bestimmt, welche Allgemeinen Geschäftsbedingungen und Datenschutzrichtlinien für Ihre Nutzung gelten:

1. **Qwen OAuth** – Melden Sie sich mit Ihrem qwen.ai-Konto an
2. **OpenAI-kompatible API** – Verwenden Sie API-Schlüssel verschiedener Anbieter von KI-Modellen

Für jede Authentifizierungsmethode können je nach zugrunde liegendem Dienstanbieter unterschiedliche Allgemeine Geschäftsbedingungen und Datenschutzhinweise gelten.

| Authentifizierungsmethode | Anbieter          | Allgemeine Geschäftsbedingungen                                                      | Datenschutzhinweis                                  |
| :------------------------ | :---------------- | :---------------------------------------------------------------------------------- | :-------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Allgemeine Geschäftsbedingungen](https://qwen.ai/termsservice)                 | [Qwen Datenschutzrichtlinie](https://qwen.ai/privacypolicy) |
| OpenAI-kompatible API     | Verschiedene Anbieter | Hängt vom gewählten API-Anbieter ab (OpenAI, Alibaba Cloud, ModelScope usw.)         | Hängt vom gewählten API-Anbieter ab                 |

## 1. Wenn Sie die Qwen OAuth-Authentifizierung verwenden

Wenn Sie sich mit Ihrem qwen.ai-Konto authentifizieren, gelten diese Dokumente zu den Allgemeinen Geschäftsbedingungen und zum Datenschutz:

- **Allgemeine Geschäftsbedingungen:** Ihre Nutzung unterliegt den [Qwen Allgemeinen Geschäftsbedingungen](https://qwen.ai/termsservice).
- **Datenschutzhinweis:** Die Erhebung und Verwendung Ihrer Daten ist in der [Qwen Datenschutzerklärung](https://qwen.ai/privacypolicy) beschrieben.

Details zur Einrichtung der Authentifizierung, zu Kontingenten und unterstützten Funktionen finden Sie unter [Authentifizierungseinrichtung](/users/configuration/settings).

## 2. Wenn Sie eine OpenAI-kompatible API-Authentifizierung verwenden

Wenn Sie sich mit API-Schlüsseln von OpenAI-kompatiblen Anbietern authentifizieren, gelten die entsprechenden Allgemeinen Geschäftsbedingungen und Datenschutzhinweise Ihres gewählten Anbieters.

> [!important]
>
> Bei Verwendung einer OpenAI-kompatiblen API-Authentifizierung unterliegen Sie den Bedingungen und Datenschutzrichtlinien Ihres gewählten API-Anbieters, nicht den Bedingungen von Qwen Code. Bitte lesen Sie die Dokumentation Ihres Anbieters für spezifische Informationen zur Datennutzung, -aufbewahrung und den Datenschutzpraktiken.

Qwen Code unterstützt verschiedene OpenAI-kompatible Anbieter. Weitere Informationen finden Sie in den Allgemeinen Geschäftsbedingungen und der Datenschutzrichtlinie Ihres jeweiligen Anbieters.

## Nutzungsstatistiken und Telemetrie

Qwen Code kann anonyme Nutzungsstatistiken und [Telemetriedaten](/developers/development/telemetry) erfassen, um die Benutzererfahrung und Produktqualität zu verbessern. Diese Datenerfassung ist optional und kann über die Konfigurationseinstellungen gesteuert werden.

### Welche Daten werden gesammelt

Wenn aktiviert, kann Qwen Code folgende Daten sammeln:

- Anonyme Nutzungsstatistiken (ausgeführte Befehle, Leistungsmetriken)
- Fehlerberichte und Absturzdaten
- Nutzungsmuster von Funktionen

### Datenerfassung nach Authentifizierungsmethode

- **Qwen OAuth:** Die Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Qwen. Sie können die Datenerfassung über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **OpenAI-kompatible API:** Qwen Code sammelt keine zusätzlichen Daten jenseits dessen, was Ihr gewählter API-Anbieter erfasst.

### 1. Werden mein Code, einschließlich Prompts und Antworten, zur Schulung von KI-Modellen verwendet?

Ob Ihr Code, einschließlich Prompts und Antworten, zur Schulung von KI-Modellen verwendet wird, hängt von Ihrer Authentifizierungsmethode und dem von Ihnen verwendeten KI-Dienstanbieter ab:

- **Qwen OAuth**: Die Datennutzung unterliegt der [Qwens Datenschutzerklärung](https://qwen.ai/privacy). Bitte beachten Sie deren Richtlinie für spezifische Details zur Datenerhebung und den Praktiken beim Modelltraining.

- **OpenAI-kompatible API**: Die Datennutzung hängt vollständig vom von Ihnen gewählten API-Anbieter ab. Jeder Anbieter hat eigene Richtlinien zur Datennutzung. Bitte überprüfen Sie die Datenschutzerklärung und die Allgemeinen Geschäftsbedingungen Ihres konkreten Anbieters.

**Wichtig**: Qwen Code selbst verwendet Ihre Prompts, Ihren Code oder Ihre Antworten nicht zum Training von Modellen. Jegliche Datennutzung zu Trainingszwecken würde durch die Richtlinien des KI-Dienstanbieters geregelt, mit dem Sie sich authentifizieren.

### 2. Was sind Nutzungsstatistiken und was bewirkt die Abmeldung?

Die Einstellung **Nutzungsstatistiken** steuert die optionale Datenerfassung durch Qwen Code zur Verbesserung der Benutzererfahrung und Produktqualität.

Wenn aktiviert, kann Qwen Code folgende Daten erfassen:

- Anonyme Telemetriedaten (ausgeführte Befehle, Leistungsmetriken, Nutzung von Funktionen)
- Fehlerberichte und Absturzdaten
- Allgemeine Nutzungsmuster

**Was NICHT von Qwen Code erfasst wird:**

- Ihr Quellcode-Inhalt
- Anweisungen, die an KI-Modelle gesendet werden
- Antworten von KI-Modellen
- Persönliche Informationen

Die Einstellung für Nutzungsstatistiken kontrolliert nur die Datenerfassung durch Qwen Code selbst. Sie hat keinen Einfluss darauf, welche Daten Ihr gewählter KI-Dienstanbieter (Qwen, OpenAI usw.) gemäß dessen eigenen Datenschutzrichtlinien erfassen darf.

### 3. Wie wechsle ich zwischen den Authentifizierungsmethoden?

Du kannst jederzeit zwischen Qwen OAuth und der OpenAI-kompatiblen API-Authentifizierung wechseln:

1. **Beim Start**: Wähle deine bevorzugte Authentifizierungsmethode aus, wenn du dazu aufgefordert wirst
2. **Innerhalb der CLI**: Verwende den Befehl `/auth`, um deine Authentifizierungsmethode neu zu konfigurieren
3. **Umgebungsvariablen**: Richte `.env`-Dateien für die automatische OpenAI-kompatible API-Authentifizierung ein

Ausführliche Anweisungen findest du in der Dokumentation zur [Authentifizierungseinrichtung](/users/configuration/settings#environment-variables-for-api-access).