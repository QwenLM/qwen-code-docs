# Qwen Code RoadMap

> **Zielsetzung**: Funktionale Parität mit Claude Code erreichen, kontinuierliche Feinabstimmung und Verbesserung der Benutzererfahrung.

| Kategorie                       | Phase 1                                                                                                                                                                            | Phase 2                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Benutzererfahrung               | ✅ Terminal-UI<br>✅ Unterstützung des OpenAI-Protokolls<br>✅ Einstellungen<br>✅ OAuth<br>✅ Cache-Kontrolle<br>✅ Speicher<br>✅ Komprimierung<br>✅ Theme                              | Bessere UI<br>OnBoarding<br>LogView<br>✅ Sitzung<br>Berechtigungen<br>🔄 Plattformübergreifende Kompatibilität |
| Codierungs-Workflow             | ✅ Slash-Befehle<br>✅ MCP<br>✅ PlanModus<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi-Model<br>✅ Chat-Verwaltung<br>✅ Tools (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>SubAgent (verbessert)<br>✅ Skill<br>✅ Headless-Modus<br>✅ Tools (WebSearch)        |
| Aufbau offener Fähigkeiten      | ✅ Benutzerdefinierte Befehle                                                                                                                                                      | ✅ QwenCode SDK<br> Erweiterung                                                                   |
| Integration des Community-Ökosystems |                                                                                                                                                                                   | ✅ VSCode-Plugin<br>🔄 ACP/Zed<br>✅ GHA                                                         |
| Administrations-Funktionen      | ✅ Statistiken<br>✅ Feedback                                                                                                                                                      | Kosten<br>Dashboard                                                                               |

> Weitere Details finden Sie in der unten stehenden Liste.

## Funktionen

#### Abgeschlossene Funktionen

| Funktion                | Version   | Beschreibung                                            | Kategorie                       |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- |
| Skill                   | `V0.6.0`  | Erweiterbare benutzerdefinierte KI-Fähigkeiten          | Codierungs-Workflow             |
| Github Actions          | `V0.5.0`  | qwen-code-action und Automatisierung                    | Integration des Community-Ökosystems |
| VSCode Plugin           | `V0.5.0`  | VSCode-Erweiterungsplugin                               | Integration des Community-Ökosystems |
| QwenCode SDK            | `V0.4.0`  | Offenes SDK für Drittanbieterintegration                | Aufbau offener Fähigkeiten      |
| Sitzung                 | `V0.4.0`  | Verbessertes Sitzungsmanagement                         | Benutzererfahrung               |
| i18n                    | `V0.3.0`  | Internationalisierung und mehrsprachige Unterstützung   | Benutzererfahrung               |
| Headless-Modus          | `V0.3.0`  | Headless-Modus (nicht-interaktiv)                       | Codierungs-Workflow             |
| ACP/Zed                 | `V0.2.0`  | ACP- und Zed-Editor-Integration                         | Integration des Community-Ökosystems |
| Terminal-Benutzeroberfläche | `V0.1.0+` | Interaktive Terminal-Benutzeroberfläche                 | Benutzererfahrung               |
| Einstellungen           | `V0.1.0+` | Konfigurationsverwaltungssystem                         | Benutzererfahrung               |
| Theme                   | `V0.1.0+` | Unterstützung mehrerer Themes                           | Benutzererfahrung               |
| OpenAI-Protokoll unterstützen | `V0.1.0+` | Unterstützung für OpenAI-API-Protokoll                  | Benutzererfahrung               |
| Chat-Verwaltung         | `V0.1.0+` | Sitzungsverwaltung (speichern, wiederherstellen, durchsuchen) | Codierungs-Workflow             |
| MCP                     | `V0.1.0+` | Model Context Protocol-Integration                      | Codierungs-Workflow             |
| Multi-Model             | `V0.1.0+` | Unterstützung und Wechsel zwischen mehreren Modellen    | Codierungs-Workflow             |
| Slash-Befehle           | `V0.1.0+` | Slash-Befehlssystem                                     | Codierungs-Workflow             |
| Tool: Bash              | `V0.1.0+` | Shell-Befehlsausführungstool (mit is_background Parameter) | Codierungs-Workflow             |
| Tool: FileRead/EditFile | `V0.1.0+` | Datei-Lese-/Schreib- und Bearbeitungstools              | Codierungs-Workflow             |
| Benutzerdefinierte Befehle | `V0.1.0+` | Laden benutzerdefinierter Befehle                       | Aufbau offener Fähigkeiten      |
| Feedback                | `V0.1.0+` | Feedback-Mechanismus (/bug Befehl)                      | Verwaltungsfunktionen           |
| Statistiken             | `V0.1.0+` | Nutzungsstatistiken und Kontingentanzeige               | Verwaltungsfunktionen           |
| Speicher                | `V0.0.9+` | Projekt- und globales Speichermanagement                | Benutzererfahrung               |
| Cache-Kontrolle         | `V0.0.9+` | Prompt-Caching-Kontrolle (Anthropic, DashScope)         | Benutzererfahrung               |
| PlanModus               | `V0.0.14` | Aufgabenplanungsmodus                                   | Codierungs-Workflow             |
| Komprimierung           | `V0.0.11` | Chat-Komprimierungsmechanismus                          | Benutzererfahrung               |
| SubAgent                | `V0.0.11` | Dediziertes Sub-Agent-System                            | Codierungs-Workflow             |
| TodoWrite               | `V0.0.10` | Aufgabenverwaltung und Fortschrittsverfolgung           | Codierungs-Workflow             |
| Tool: TextSearch        | `V0.0.8+` | Textsuchtool (grep, unterstützt .qwenignore)            | Codierungs-Workflow             |
| Tool: WebFetch          | `V0.0.7+` | Web-Inhaltsabruf-Tool                                   | Codierungs-Workflow             |
| Tool: WebSearch         | `V0.0.7+` | Websuchtool (unter Verwendung der Tavily-API)           | Codierungs-Workflow             |
| OAuth                   | `V0.0.5+` | OAuth-Login-Authentifizierung (Qwen OAuth)              | Benutzererfahrung               |

#### Zu entwickelnde Funktionen

| Funktion                     | Priorität | Status        | Beschreibung                           | Kategorie                   |
| ---------------------------- | --------- | ------------- | -------------------------------------- | --------------------------- |
| Bessere Benutzeroberfläche  | P1        | Geplant       | Optimierte Terminal-Benutzerinteraktion | Benutzererfahrung           |
| OnBoarding                   | P1        | Geplant       | Einführungsablauf für neue Benutzer    | Benutzererfahrung           |
| Berechtigungen               | P1        | Geplant       | Optimierung des Berechtigungssystems   | Benutzererfahrung           |
| Plattformübergreifende Kompatibilität | P1 | In Arbeit | Kompatibilität mit Windows/Linux/macOS | Benutzererfahrung           |
| LogView                      | P2        | Geplant       | Anzeige und Debugging von Logs         | Benutzererfahrung           |
| Hooks                        | P2        | In Arbeit     | Erweiterungssystem für Hooks           | Entwicklungsworkflow        |
| Erweiterung                  | P2        | Geplant       | Erweiterungssystem                     | Offene Fähigkeiten aufbauen |
| Kosten                       | P2        | Geplant       | Kostenverfolgung und -analyse          | Verwaltungsfunktionen       |
| Dashboard                    | P2        | Geplant       | Verwaltungs-Dashboard                  | Verwaltungsfunktionen       |

#### Zu besprechende herausragende Funktionen

| Funktion         | Status   | Beschreibung                                          |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Forschung| Projektentdeckung und schneller Start                 |
| Wettbewerbsmodus | Forschung| Wettbewerbsmodus                                      |
| Pulse            | Forschung| Analyse der Benutzeraktivitätspulse (OpenAI Pulse-Referenz) |
| Code-Wiki        | Forschung| Wiki-/Dokumentationssystem für Projektcodebasen       |