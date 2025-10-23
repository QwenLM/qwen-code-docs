# Qwen Code: Nutzungsbedingungen und Datenschutzhinweise

Qwen Code ist ein Open-Source AI Coding Assistant Tool, das vom Qwen Code Team betreut wird. Dieses Dokument beschreibt die Nutzungsbedingungen und Datenschutzrichtlinien, die bei der Verwendung der Authentifizierungsmethoden und AI-Modell-Services von Qwen Code gelten.

## Wie du deine Authentifizierungsmethode bestimmst

Qwen Code unterstützt zwei Haupt-Authentifizierungsmethoden für den Zugriff auf KI-Modelle. Deine Authentifizierungsmethode bestimmt, welche Allgemeinen Geschäftsbedingungen und Datenschutzrichtlinien für deine Nutzung gelten:

1. **Qwen OAuth** – Anmeldung mit deinem qwen.ai-Konto
2. **OpenAI-kompatible API** – Verwendung von API-Schlüsseln verschiedener KI-Modellanbieter

Je nach Authentifizierungsmethode können unterschiedliche Allgemeine Geschäftsbedingungen und Datenschutzhinweise gelten, abhängig vom zugrunde liegenden Dienstanbieter.

| Authentifizierungsmethode | Anbieter          | Allgemeine Geschäftsbedingungen                                                  | Datenschutzhinweis                                  |
| :------------------------ | :---------------- | :------------------------------------------------------------------------------- | :-------------------------------------------------- |
| Qwen OAuth                | Qwen AI           | [Qwen Allgemeine Geschäftsbedingungen](https://qwen.ai/termsservice)             | [Qwen Datenschutzrichtlinie](https://qwen.ai/privacypolicy) |
| OpenAI-kompatible API     | Verschiedene Anbieter | Abhängig von deinem gewählten API-Anbieter (OpenAI, Alibaba Cloud, ModelScope, etc.) | Abhängig von deinem gewählten API-Anbieter          |

## 1. Wenn du die Qwen OAuth-Authentifizierung verwendest

Wenn du dich mit deinem qwen.ai-Konto authentifizierst, gelten diese Dokumente zu den Allgemeinen Geschäftsbedingungen und dem Datenschutzhinweis:

- **Allgemeine Geschäftsbedingungen:** Deine Nutzung unterliegt den [Qwen Allgemeinen Geschäftsbedingungen](https://qwen.ai/termsservice).
- **Datenschutzhinweis:** Die Erfassung und Verwendung deiner Daten ist in der [Qwen Datenschutzerklärung](https://qwen.ai/privacypolicy) beschrieben.

Details zur Einrichtung der Authentifizierung, zu den Quoten und den unterstützten Funktionen findest du unter [Authentifizierung einrichten](./cli/authentication.md).

## 2. Wenn du OpenAI-kompatible API-Authentifizierung verwendest

Wenn du dich mit API-Schlüsseln von OpenAI-kompatiblen Anbietern authentifizierst, gelten die entsprechenden Allgemeinen Geschäftsbedingungen und Datenschutzhinweise deines gewählten Anbieters.

**Wichtig:** Bei Verwendung der OpenAI-kompatiblen API-Authentifizierung unterliegst du den Bedingungen und Datenschutzrichtlinien deines gewählten API-Anbieters, nicht den Bedingungen von Qwen Code. Bitte lies die Dokumentation deines Anbieters, um spezifische Details zu Datennutzung, -aufbewahrung und Datenschutzpraktiken zu erfahren.

Qwen Code unterstützt verschiedene OpenAI-kompatible Anbieter. Bitte lies die Allgemeinen Geschäftsbedingungen und Datenschutzrichtlinien deines jeweiligen Anbieters für detaillierte Informationen.

## Nutzungsstatistiken und Telemetrie

Qwen Code kann anonyme Nutzungsstatistiken und Telemetriedaten sammeln, um die Benutzererfahrung und Produktqualität zu verbessern. Diese Datensammlung ist optional und kann über die Konfigurationseinstellungen gesteuert werden.

### Welche Daten werden gesammelt

Wenn aktiviert, kann Qwen Code folgende Daten sammeln:

- Anonyme Nutzungsstatistiken (ausgeführte Befehle, Leistungsmetriken)
- Fehlerberichte und Absturzdaten
- Nutzungsmuster von Funktionen

### Datenerfassung nach Authentifizierungsmethode

- **Qwen OAuth:** Die Nutzungsstatistiken unterliegen der Datenschutzrichtlinie von Qwen. Du kannst die Datenerfassung über die Konfigurationseinstellungen von Qwen Code deaktivieren.
- **OpenAI-kompatible API:** Qwen Code sammelt keine zusätzlichen Daten jenseits dessen, was dein gewählter API-Anbieter erfasst.

### Anleitung zum Deaktivieren

Du kannst die Sammlung von Nutzungsstatistiken deaktivieren, indem du die Anweisungen in der Dokumentation zur [Konfiguration der Nutzungsstatistiken](./cli/configuration.md#usage-statistics) befolgst.

## Häufig gestellte Fragen (FAQ)

### 1. Wird mein Code, einschließlich Prompts und Antworten, zur Trainings von KI-Modellen verwendet?

Ob dein Code, einschließlich Prompts und Antworten, zur Trainings von KI-Modellen verwendet wird, hängt von deiner Authentifizierungsmethode und dem von dir verwendeten KI-Service-Anbieter ab:

- **Qwen OAuth**: Die Datennutzung unterliegt der [Qwen Datenschutzerklärung](https://qwen.ai/privacy). Bitte lies dort nach, um Details zur Datensammlung und den Praktiken beim Modelltraining zu erfahren.

- **OpenAI-kompatible API**: Die Datennutzung hängt vollständig vom gewählten API-Anbieter ab. Jeder Anbieter hat eigene Richtlinien zur Datennutzung. Bitte lies die Datenschutzerklärung und Allgemeinen Geschäftsbedingungen deines konkreten Anbieters.

**Wichtig**: Qwen Code selbst verwendet deine Prompts, deinen Code oder deine Antworten nicht zum Training von Modellen. Jegliche Datennutzung zu Trainingszwecken würde durch die Richtlinien des KI-Service-Anbieters geregelt, mit dem du dich authentifizierst.

### 2. Was sind Nutzungsstatistiken und was bewirkt die Opt-out-Funktion?

Die Einstellung **Nutzungsstatistiken** steuert die optionale Datensammlung durch Qwen Code zur Verbesserung der Benutzererfahrung und Produktqualität.

Wenn aktiviert, kann Qwen Code folgende Daten sammeln:

- Anonyme Telemetriedaten (ausgeführte Befehle, Leistungsmetriken, Nutzung von Funktionen)
- Fehlerberichte und Absturzdaten
- Allgemeine Nutzungsmuster

**Was NICHT von Qwen Code gesammelt wird:**

- Dein Quellcode-Inhalt
- Prompts, die an KI-Modelle gesendet werden
- Antworten von KI-Modellen
- Persönliche Informationen

Die Einstellung für Nutzungsstatistiken kontrolliert nur die Datensammlung durch Qwen Code selbst. Sie hat keinen Einfluss darauf, welche Daten dein gewählter KI-Dienstanbieter (Qwen, OpenAI usw.) gemäß dessen eigenen Datenschutzrichtlinien erfassen könnte.

Du kannst die Sammlung von Nutzungsstatistiken deaktivieren, indem du den Anweisungen in der Dokumentation [Nutzungsstatistiken konfigurieren](./cli/configuration.md#usage-statistics) folgst.

### 3. Wie wechsle ich zwischen Authentifizierungsmethoden?

Du kannst jederzeit zwischen Qwen OAuth und OpenAI-kompatibler API-Authentifizierung wechseln:

1. **Beim Start**: Wähle deine bevorzugte Authentifizierungsmethode aus, wenn du dazu aufgefordert wirst
2. **Innerhalb der CLI**: Verwende den Befehl `/auth`, um deine Authentifizierungsmethode neu zu konfigurieren
3. **Umgebungsvariablen**: Richte `.env`-Dateien für die automatische OpenAI-kompatible API-Authentifizierung ein

Ausführliche Anweisungen findest du in der Dokumentation unter [Authentication Setup](./cli/authentication.md).