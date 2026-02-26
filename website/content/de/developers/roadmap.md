# Qwen Code RoadMap

> **Zielsetzung**: Funktionale Parität mit Claude Code erreichen, Details kontinuierlich verfeinern und Benutzererfahrung verbessern.

| Kategorie                       | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benutzererfahrung               | ✅ Terminal UI<br>✅ OpenAI-Protokoll unterstützen<br>✅ Einstellungen<br>✅ OAuth<br>✅ Cache-Kontrolle<br>✅ Speicher<br>✅ Komprimierung<br>✅ Theme                                | Bessere UI<br>OnBoarding<br>LogView<br>✅ Sitzung<br>Berechtigungen<br>🔄 Plattformübergreifende Kompatibilität<br>✅ Codierungsplan<br>✅ Anthropic-Anbieter<br>✅ Multimodale Eingabe<br>✅ Einheitliche WebUI |
| Codier-Arbeitsablauf            | ✅ Slash-Befehle<br>✅ MCP<br>✅ PlanModus<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi-Modell<br>✅ Chat-Verwaltung<br>✅ Tools (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Headless-Modus<br>✅ Tools (WebSearch)<br>✅ LSP-Unterstützung<br>✅ Concurrent Runner                                                                         |
| Offene Fähigkeiten aufbauen     | ✅ Benutzerdefinierte Befehle                                                                                                                                                      | ✅ QwenCode SDK<br>✅ Erweiterungssystem                                                                                                                                                 |
| Community-Ökosystem integrieren |                                                                                                                                                                                    | ✅ VSCode-Plugin<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Administrationsfähigkeiten      | ✅ Statistiken<br>✅ Feedback                                                                                                                                                      | Kosten<br>Dashboard<br>✅ Benutzer-Feedback-Dialog                                                                                                                                      |

> Weitere Details finden Sie in der unten stehenden Liste.

## Funktionen

#### Abgeschlossene Funktionen

| Funktion                | Version   | Beschreibung                                            | Kategorie                       | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Coding Plan**         | `V0.10.0` | Bailian Coding Plan Authentifizierung & Modelle         | Benutzererfahrung               | 2     |
| Vereinheitlichtes WebUI | `V0.9.0`  | Gemeinsame WebUI-Komponentenbibliothek für VSCode/CLI   | Benutzererfahrung               | 2     |
| Chat exportieren        | `V0.8.0`  | Sitzungen nach Markdown/HTML/JSON/JSONL exportieren     | Benutzererfahrung               | 2     |
| Erweiterungssystem      | `V0.8.0`  | Vollständiges Erweiterungsmanagement mit Slash-Befehlen | Offene Fähigkeiten aufbauen     | 2     |
| LSP-Unterstützung       | `V0.7.0`  | Experimenteller LSP-Dienst (`--experimental-lsp`)       | Codierungsworkflow              | 2     |
| Anthropic-Anbieter      | `V0.7.0`  | Unterstützung für Anthropic-API-Anbieter                | Benutzererfahrung               | 2     |
| Nutzerfeedbackdialog    | `V0.7.0`  | In-App-Feedback-Erfassung mit Fatigue-Mechanismus       | Verwaltungsfunktionen           | 2     |
| Parallele Ausführung    | `V0.6.0`  | Stapelverarbeitung der CLI mit Git-Integration          | Codierungsworkflow              | 2     |
| Multimodale Eingabe     | `V0.6.0`  | Unterstützung für Bild-, PDF-, Audio- und Videoeingaben | Benutzererfahrung               | 2     |
| Skill                   | `V0.6.0`  | Erweiterbare benutzerdefinierte KI-Fähigkeiten (experimentell) | Codierungsworkflow         | 2     |
| Github Actions          | `V0.5.0`  | qwen-code-action und Automatisierung                    | Integration des Community-Ökosystems | 1     |
| VSCode-Plugin           | `V0.5.0`  | VSCode-Erweiterungsplugin                               | Integration des Community-Ökosystems | 1     |
| QwenCode SDK            | `V0.4.0`  | Offenes SDK für Drittanbieterintegration                | Offene Fähigkeiten aufbauen     | 1     |
| Sitzung                 | `V0.4.0`  | Verbessertes Sitzungsmanagement                         | Benutzererfahrung               | 1     |
| i18n                    | `V0.3.0`  | Internationalisierung und mehrsprachige Unterstützung   | Benutzererfahrung               | 1     |
| Headless-Modus          | `V0.3.0`  | Headless-Modus (nicht-interaktiv)                       | Codierungsworkflow              | 1     |
| ACP/Zed                 | `V0.2.0`  | ACP- und Zed-Editor-Integration                         | Integration des Community-Ökosystems | 1     |
| Terminal-Benutzeroberfläche | `V0.1.0+` | Interaktive Terminal-Benutzeroberfläche              | Benutzererfahrung               | 1     |
| Einstellungen           | `V0.1.0+` | Konfigurationsmanagementsystem                          | Benutzererfahrung               | 1     |
| Theme                   | `V0.1.0+` | Unterstützung mehrerer Themes                           | Benutzererfahrung               | 1     |
| OpenAI-Protokoll unterstützen | `V0.1.0+` | Unterstützung für OpenAI-API-Protokoll            | Benutzererfahrung               | 1     |
| Chat-Management         | `V0.1.0+` | Sitzungsmanagement (speichern, wiederherstellen, durchsuchen) | Codierungsworkflow         | 1     |
| MCP                     | `V0.1.0+` | Integration des Model Context Protocol                  | Codierungsworkflow              | 1     |
| Multi-Model             | `V0.1.0+` | Unterstützung und Wechsel zwischen mehreren Modellen    | Codierungsworkflow              | 1     |
| Slash-Befehle           | `V0.1.0+` | Slash-Befehlssystem                                     | Codierungsworkflow              | 1     |
| Tool: Bash              | `V0.1.0+` | Shell-Befehlsausführungstool (mit is_background-Parameter) | Codierungsworkflow           | 1     |
| Tool: FileRead/EditFile | `V0.1.0+` | Datei-Lese-/Schreib- und Bearbeitungstools              | Codierungsworkflow              | 1     |
| Benutzerdefinierte Befehle | `V0.1.0+` | Laden benutzerdefinierter Befehle                    | Offene Fähigkeiten aufbauen     | 1     |
| Feedback                | `V0.1.0+` | Feedback-Mechanismus (/bug-Befehl)                      | Verwaltungsfunktionen           | 1     |
| Statistiken             | `V0.1.0+` | Nutzungsstatistiken und Kontingentanzeige               | Verwaltungsfunktionen           | 1     |
| Speicher                | `V0.0.9+` | Projekt- und globales Speichermanagement                | Benutzererfahrung               | 1     |
| Cache-Steuerung         | `V0.0.9+` | Steuerung des Prompt-Cachings (Anthropic, DashScope)    | Benutzererfahrung               | 1     |
| PlanMode                | `V0.0.14` | Aufgabenplanungsmodus                                   | Codierungsworkflow              | 1     |
| Komprimierung           | `V0.0.11` | Chat-Komprimierungsmechanismus                          | Benutzererfahrung               | 1     |
| SubAgent                | `V0.0.11` | Dediziertes Sub-Agent-System                            | Codierungsworkflow              | 1     |
| TodoWrite               | `V0.0.10` | Aufgabenmanagement und Fortschrittsverfolgung           | Codierungsworkflow              | 1     |
| Tool: TextSearch        | `V0.0.8+` | Textsuchtool (grep, unterstützt .qwenignore)            | Codierungsworkflow              | 1     |
| Tool: WebFetch          | `V0.0.7+` | Web-Inhaltsabruf-Tool                                   | Codierungsworkflow              | 1     |
| Tool: WebSearch         | `V0.0.7+` | Websuchtool (unter Verwendung der Tavily-API)           | Codierungsworkflow              | 1     |
| OAuth                   | `V0.0.5+` | OAuth-Login-Authentifizierung (Qwen OAuth)              | Benutzererfahrung               | 1     |

#### Funktionen zur Entwicklung

| Funktion                     | Priorität | Status      | Beschreibung                           | Kategorie                 |
| ---------------------------- | --------- | ----------- | -------------------------------------- | ------------------------- |
| Bessere Benutzeroberfläche  | P1        | Geplant     | Optimierte Terminal-Benutzerinteraktion | Benutzererfahrung         |
| OnBoarding                   | P1        | Geplant     | Einführungsablauf für neue Benutzer     | Benutzererfahrung         |
| Berechtigungen               | P1        | Geplant     | Optimierung des Berechtigungssystems    | Benutzererfahrung         |
| Plattformübergreifende Kompatibilität | P1 | In Arbeit | Kompatibilität mit Windows/Linux/macOS | Benutzererfahrung         |
| LogView                      | P2        | Geplant     | Funktion zum Anzeigen und Debuggen von Logs | Benutzererfahrung       |
| Hooks                        | P2        | In Arbeit   | Erweiterungshakensystem                | Entwicklungsworkflow      |
| Kosten                       | P2        | Geplant     | Kostenverfolgung und -analyse           | Verwaltungsfähigkeiten    |
| Dashboard                    | P2        | Geplant     | Verwaltungs-Dashboard                  | Verwaltungsfähigkeiten    |

#### Zu besprechende herausragende Funktionen

| Funktion         | Status   | Beschreibung                                          |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Forschung| Projektentdeckung und schneller Start                 |
| Wettbewerbsmodus | Forschung| Wettbewerbsmodus                                      |
| Pulse            | Forschung| Analyse der Benutzeraktivitätspulse (OpenAI Pulse-Referenz) |
| Code-Wiki        | Forschung| Wiki/Dokumentationssystem für Projektcodebasen        |