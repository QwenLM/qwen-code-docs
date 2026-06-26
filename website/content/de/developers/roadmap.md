# Qwen Code RoadMap

> **Ziel**: Die Produktfunktionalität von Claude Code einholen, Details kontinuierlich verfeinern und die Benutzererfahrung verbessern.

| Kategorie                        | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benutzererfahrung                 | ✅ Terminal UI<br>✅ Support OpenAI Protocol<br>✅ Settings<br>✅ OAuth<br>✅ Cache Control<br>✅ Memory<br>✅ Compress<br>✅ Theme                                                      | Better UI<br>Onboarding<br>LogView<br>✅ Session<br>Berechtigungen<br>🔄 Plattformübergreifende Kompatibilität<br>✅ Coding Plan<br>✅ Anthropic Provider<br>✅ Multimodale Eingabe<br>✅ Einheitliches WebUI |
| Codierungs-Workflow                 | ✅ Slash Commands<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi Model<br>✅ Chat Management<br>✅ Tools (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Headless Mode<br>✅ Tools (WebSearch)<br>✅ LSP Support<br>✅ Concurrent Runner                                                                              |
| Offene Fähigkeiten aufbauen      | ✅ Custom Commands                                                                                                                                                              | ✅ QwenCode SDK<br>✅ Erweiterungssystem                                                                                                                                                  |
| Community-Ökosystem integrieren |                                                                                                                                                                                    | ✅ VSCode Plugin<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Administrative Fähigkeiten     | ✅ Stats<br>✅ Feedback                                                                                                                                                            | Kosten<br>Dashboard<br>✅ Benutzerfeedback-Dialog                                                                                                                                           |

> Weitere Details finden Sie in der Liste unten.

## Features

#### Abgeschlossene Funktionen

| Funktion                 | Version   | Beschreibung                                             | Kategorie                        | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Coding Plan**         | `V0.10.0` | Alibaba Cloud Coding Plan Authentifizierung und Modelle       | Benutzererfahrung                 | 2     |
| Einheitliches WebUI           | `V0.9.0`  | Gemeinsame WebUI-Komponentenbibliothek für VSCode/CLI           | Benutzererfahrung                 | 2     |
| Chat-Export             | `V0.8.0`  | Exportiert Sitzungen als Markdown/HTML/JSON/JSONL             | Benutzererfahrung                 | 2     |
| Erweiterungssystem        | `V0.8.0`  | Vollständige Erweiterungsverwaltung mit Slash-Befehlen           | Offene Fähigkeiten aufbauen      | 2     |
| LSP-Unterstützung             | `V0.7.0`  | Experimenteller LSP-Dienst (`--experimental-lsp`)         | Codierungs-Workflow                 | 2     |
| Anthropic Provider      | `V0.7.0`  | Unterstützung des Anthropic API-Anbieters                          | Benutzererfahrung                 | 2     |
| Benutzerfeedback-Dialog    | `V0.7.0`  | In-App-Feedback-Sammlung mit Ermüdungsmechanismus       | Administrative Fähigkeiten     | 2     |
| Concurrent Runner       | `V0.6.0`  | Batch-CLI-Ausführung mit Git-Integration                | Codierungs-Workflow                 | 2     |
| Multimodale Eingabe        | `V0.6.0`  | Unterstützung für Bild-, PDF-, Audio- und Videoeingabe                  | Benutzererfahrung                 | 2     |
| Skill                   | `V0.6.0`  | Erweiterbare benutzerdefinierte KI-Fähigkeiten (experimentell)              | Codierungs-Workflow                 | 2     |
| GitHub Actions          | `V0.5.0`  | qwen-code-action und Automatisierung                         | Community-Ökosystem integrieren | 1     |
| VSCode Plugin           | `V0.5.0`  | VSCode-Erweiterungsplugin                                 | Community-Ökosystem integrieren | 1     |
| QwenCode SDK            | `V0.4.0`  | Offenes SDK für Integration durch Dritte                    | Offene Fähigkeiten aufbauen      | 1     |
| Sitzung                 | `V0.4.0`  | Verbesserte Sitzungsverwaltung                             | Benutzererfahrung                 | 1     |
| i18n                    | `V0.3.0`  | Internationalisierung und mehrsprachige Unterstützung           | Benutzererfahrung                 | 1     |
| Headless Modus           | `V0.3.0`  | Headless-Modus (nicht interaktiv)                         | Codierungs-Workflow                 | 1     |
| ACP/Zed                 | `V0.2.0`  | Integration der Editoren ACP und Zed                          | Community-Ökosystem integrieren | 1     |
| Terminal UI             | `V0.1.0+` | Interaktive Terminal-Benutzeroberfläche                     | Benutzererfahrung                 | 1     |
| Einstellungen                | `V0.1.0+` | Konfigurationsverwaltungssystem                         | Benutzererfahrung                 | 1     |
| Design                   | `V0.1.0+` | Unterstützung mehrerer Designs                                     | Benutzererfahrung                 | 1     |
| OpenAI-Protokoll-Unterstützung | `V0.1.0+` | Unterstützung des OpenAI-API-Protokolls                         | Benutzererfahrung                 | 1     |
| Chat-Verwaltung         | `V0.1.0+` | Sitzungsverwaltung (speichern, wiederherstellen, durchsuchen)              | Codierungs-Workflow                 | 1     |
| MCP                     | `V0.1.0+` | Integration des Model Context Protocol                      | Codierungs-Workflow                 | 1     |
| Multi-Modell             | `V0.1.0+` | Unterstützung und Wechsel mehrerer Modelle                       | Codierungs-Workflow                 | 1     |
| Slash-Befehle          | `V0.1.0+` | Slash-Befehlssystem                                    | Codierungs-Workflow                 | 1     |
| Tool: Bash              | `V0.1.0+` | Shell-Befehlsausführungstool (mit is_background-Parameter) | Codierungs-Workflow                 | 1     |
| Tool: FileRead/EditFile | `V0.1.0+` | Lese-/Schreib- und Bearbeitungswerkzeuge für Dateien                          | Codierungs-Workflow                 | 1     |
| Benutzerdefinierte Befehle         | `V0.1.0+` | Laden benutzerdefinierter Befehle                                  | Offene Fähigkeiten aufbauen      | 1     |
| Feedback                | `V0.1.0+` | Feedback-Mechanismus (/bug-Befehl)                       | Administrative Fähigkeiten     | 1     |
| Statistiken                   | `V0.1.0+` | Nutzungsstatistiken und Kontingentanzeige                      | Administrative Fähigkeiten     | 1     |
| Speicher                  | `V0.0.9+` | Projekt- und globales Speichermanagement              | Benutzererfahrung                 | 1     |
| Cache-Steuerung           | `V0.0.9+` | Prompt-Caching-Steuerung (Anthropic, DashScope)           | Benutzererfahrung                 | 1     |
| Planungsmodus                | `V0.0.14` | Aufgabenplanungsmodus                                      | Codierungs-Workflow                 | 1     |
| Komprimieren                | `V0.0.11` | Chat-Komprimierungsmechanismus                              | Benutzererfahrung                 | 1     |
| SubAgent                | `V0.0.11` | Dediziertes Unter-Agent-System                              | Codierungs-Workflow                 | 1     |
| TodoWrite               | `V0.0.10` | Aufgabenverwaltung und Fortschrittsverfolgung                   | Codierungs-Workflow                 | 1     |
| Tool: TextSearch        | `V0.0.8+` | Textsuchwerkzeug (grep, unterstützt .qwenignore)           | Codierungs-Workflow                 | 1     |
| Tool: WebFetch          | `V0.0.7+` | Werkzeug zum Abrufen von Webinhalten                               | Codierungs-Workflow                 | 1     |
| Tool: WebSearch         | `V0.0.7+` | Websuchwerkzeug (mit Tavily API)                      | Codierungs-Workflow                 | 1     |
| OAuth                   | `V0.0.5+` | OAuth-Anmeldeauthentifizierung (Qwen OAuth)                 | Benutzererfahrung                 | 1     |

#### Zu entwickelnde Funktionen

| Funktion                      | Priorität | Status      | Beschreibung                       | Kategorie                    |
| ---------------------------- | -------- | ----------- | --------------------------------- | --------------------------- |
| Better UI                    | P1       | Geplant     | Optimierte Terminal-UI-Interaktion | Benutzererfahrung             |
| Onboarding                   | P1       | Geplant     | Onboarding-Ablauf für neue Benutzer          | Benutzererfahrung             |
| Berechtigungen                   | P1       | Geplant     | Optimierung des Berechtigungssystems    | Benutzererfahrung             |
| Plattformübergreifende Kompatibilität | P1       | In Bearbeitung | Windows/Linux/macOS-Kompatibilität | Benutzererfahrung             |
| LogView                      | P2       | Geplant     | Protokollanzeige- und Debugging-Funktion | Benutzererfahrung             |
| Hooks                        | P2       | In Bearbeitung | Erweiterungs-Hooks-System            | Codierungs-Workflow             |
| Kosten                        | P2       | Geplant     | Kostenverfolgung und -analyse        | Administrative Fähigkeiten |
| Dashboard                    | P2       | Geplant     | Verwaltungsdashboard              | Administrative Fähigkeiten |

#### Besondere zu diskutierende Funktionen

| Funktion          | Status   | Beschreibung                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Forschung | Projektentdeckung und Schnellstart                    |
| Wettbewerbsmodus | Forschung | Wettbewerbsmodus                                      |
| Pulse            | Forschung | Pulsanalyse der Benutzeraktivität (Referenz: OpenAI Pulse) |
| Code Wiki        | Forschung | Wiki-/Dokumentationssystem für die Projektcodebasis             |