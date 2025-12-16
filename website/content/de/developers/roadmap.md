# Qwen Code RoadMap

> **Ziel**: Die Produktfunktionalität von Claude Code erreichen, Details kontinuierlich verfeinern und die Benutzererfahrung verbessern.

| Kategorie                          | Phase 1                                                                                                                                                                               | Phase 2                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Benutzererfahrung                  | ✅ Terminal UI<br>✅ Unterstützung des OpenAI-Protokolls<br>✅ Einstellungen<br>✅ OAuth<br>✅ Cache-Kontrolle<br>✅ Speicher<br>✅ Komprimierung<br>✅ Design/Theme                | Bessere UI<br>OnBoarding<br>Log-Ansicht<br>✅ Sitzung<br>Berechtigungen<br>🔄 Plattformübergreifende Kompatibilität |
| Coding-Workflow                    | ✅ Slash-Befehle<br>✅ MCP<br>✅ PlanModus<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi-Modell<br>✅ Chat-Verwaltung<br>✅ Werkzeuge (WebFetch, Bash, Textsuche, DateiLesen, DateiBearbeiten) | 🔄 Hooks<br>SubAgent (verbessert)<br>✅ Fähigkeiten<br>✅ Headless-Modus<br>✅ Werkzeuge (Websuche)         |
| Aufbau offener Fähigkeiten         | ✅ Benutzerdefinierte Befehle                                                                                                                                                         | ✅ QwenCode SDK<br>Erweiterung                                                                      |
| Integration des Community-Ökosystems |                                                                                                                                                                                       | ✅ VSCode Plugin<br>🔄 ACP/Zed<br>✅ GHA                                                           |
| Administrationsfähigkeiten         | ✅ Statistiken<br>✅ Feedback                                                                                                                                                          | Kosten<br>Dashboard                                                                                 |

> Für weitere Details siehe unten stehende Liste.

## Funktionen

#### Abgeschlossene Funktionen

| Funktion                | Version   | Beschreibung                                            | Kategorie                        |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- |
| Skill                   | `V0.6.0`  | Erweiterbare benutzerdefinierte KI-Fähigkeiten          | Codierungsworkflow              |
| Github Actions          | `V0.5.0`  | qwen-code-action und Automatisierung                    | Integration des Community-Ökosystems |
| VSCode Plugin           | `V0.5.0`  | VSCode-Erweiterungsplugin                                | Integration des Community-Ökosystems |
| QwenCode SDK            | `V0.4.0`  | Offenes SDK für Drittanbieterintegration                | Aufbau offener Fähigkeiten       |
| Session                 | `V0.4.0`  | Verbessertes Sitzungsmanagement                         | Benutzererfahrung               |
| i18n                    | `V0.3.0`  | Internationalisierung und mehrsprachige Unterstützung   | Benutzererfahrung               |
| Headless Mode           | `V0.3.0`  | Headless-Modus (nicht-interaktiv)                       | Codierungsworkflow              |
| ACP/Zed                 | `V0.2.0`  | ACP- und Zed-Editor-Integration                         | Integration des Community-Ökosystems |
| Terminal UI             | `V0.1.0+` | Interaktive Terminal-Benutzeroberfläche                 | Benutzererfahrung               |
| Settings                | `V0.1.0+` | Konfigurationsmanagementsystem                           | Benutzererfahrung               |
| Theme                   | `V0.1.0+` | Unterstützung mehrerer Themen                           | Benutzererfahrung               |
| Support OpenAI Protocol | `V0.1.0+` | Unterstützung des OpenAI-API-Protokolls                 | Benutzererfahrung               |
| Chat Management         | `V0.1.0+` | Sitzungsverwaltung (Speichern, Wiederherstellen, Durchsuchen) | Codierungsworkflow        |
| MCP                     | `V0.1.0+` | Integration des Model Context Protocol                  | Codierungsworkflow              |
| Multi Model             | `V0.1.0+` | Unterstützung und Wechsel zwischen mehreren Modellen    | Codierungsworkflow              |
| Slash Commands          | `V0.1.0+` | System für Slash-Befehle                                | Codierungsworkflow              |
| Tool: Bash              | `V0.1.0+` | Shell-Befehlsausführungstool (mit is_background Parameter) | Codierungsworkflow         |
| Tool: FileRead/EditFile | `V0.1.0+` | Tools zum Lesen/Schreiben und Bearbeiten von Dateien    | Codierungsworkflow              |
| Custom Commands         | `V0.1.0+` | Laden benutzerdefinierter Befehle                      | Aufbau offener Fähigkeiten       |
| Feedback                | `V0.1.0+` | Feedback-Mechanismus (/bug Befehl)                      | Administrative Fähigkeiten      |
| Stats                   | `V0.1.0+` | Nutzungsstatistiken und Kontingentanzeige               | Administrative Fähigkeiten      |
| Memory                  | `V0.0.9+` | Projekt- und globales Speichermanagement                | Benutzererfahrung               |
| Cache Control           | `V0.0.9+` | DashScope-Cache-Kontrolle                               | Benutzererfahrung               |
| PlanMode                | `V0.0.14` | Aufgabenplanungsmodus                                   | Codierungsworkflow              |
| Compress                | `V0.0.11` | Chat-Komprimierungsmechanismus                          | Benutzererfahrung               |
| SubAgent                | `V0.0.11` | Dediziertes Sub-Agent-System                            | Codierungsworkflow              |
| TodoWrite               | `V0.0.10` | Aufgabenmanagement und Fortschrittsverfolgung           | Codierungsworkflow              |
| Tool: TextSearch        | `V0.0.8+` | Textsuchwerkzeug (grep, unterstützt .qwenignore)        | Codierungsworkflow              |
| Tool: WebFetch          | `V0.0.7+` | Werkzeug zum Abrufen von Webinhalten                    | Codierungsworkflow              |
| Tool: WebSearch         | `V0.0.7+` | Websuchwerkzeug (unter Verwendung der Tavily-API)       | Codierungsworkflow              |
| OAuth                   | `V0.0.5+` | OAuth-Anmeldeauthentifizierung (Qwen OAuth)             | Benutzererfahrung               |

#### Funktionen zur Entwicklung

| Funktion                     | Priorität | Status       | Beschreibung                          | Kategorie                 |
| ---------------------------- | --------- | ------------ | ------------------------------------- | ------------------------- |
| Bessere Benutzeroberfläche   | P1        | Geplant      | Optimierte Terminal-UI-Interaktion    | Benutzererfahrung         |
| OnBoarding                   | P1        | Geplant      | Onboarding-Ablauf für neue Benutzer   | Benutzererfahrung         |
| Berechtigungen               | P1        | Geplant      | Optimierung des Berechtigungssystems  | Benutzererfahrung         |
| Plattformübergreifende Kompatibilität | P1        | In Arbeit    | Kompatibilität mit Windows/Linux/macOS | Benutzererfahrung         |
| Log-Ansicht                  | P2        | Geplant      | Funktion zum Anzeigen und Debuggen von Logs | Benutzererfahrung         |
| Hooks                        | P2        | In Arbeit    | System für Erweiterungs-Hooks         | Codierungsworkflow        |
| Erweiterungen                | P2        | Geplant      | Erweiterungssystem                    | Offene Fähigkeiten aufbauen |
| Kosten                       | P2        | Geplant      | Verfolgung und Analyse von Kosten     | Administrative Fähigkeiten |
| Dashboard                    | P2        | Geplant      | Verwaltungs-Dashboard                 | Administrative Fähigkeiten |

#### Besondere Funktionen zur Diskussion

| Funktion         | Status   | Beschreibung                                            |
| ---------------- | -------- | ------------------------------------------------------- |
| Home Spotlight   | Recherche | Projektentdeckung und schneller Start                  |
| Wettbewerbsmodus | Recherche | Wettbewerbsmodus                                       |
| Pulse            | Recherche | Analyse des Benutzeraktivitätsverlaufs (OpenAI Pulse Referenz) |
| Code Wiki        | Recherche | Wiki/Dokumentationssystem für die Projektcodebasis     |