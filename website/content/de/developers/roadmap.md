# Qwen Code RoadMap

> **Ziel**: Mit der Produktfunktionalität von Claude Code gleichziehen, Details kontinuierlich verfeinern und die User Experience verbessern.

| Kategorie                         | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User Experience                   | ✅ Terminal UI<br>✅ Support für OpenAI-Protokoll<br>✅ Einstellungen<br>✅ OAuth<br>✅ Cache-Steuerung<br>✅ Memory<br>✅ Komprimierung<br>✅ Theme                                                | Bessere UI<br>Onboarding<br>LogView<br>✅ Session<br>Berechtigungen<br>🔄 Cross-Platform-Kompatibilität<br>✅ Coding Plan<br>✅ Anthropic Provider<br>✅ Multimodale Eingaben<br>✅ Unified WebUI |
| Coding Workflow                   | ✅ Slash Commands<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi Model<br>✅ Chat-Management<br>✅ Tools (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Headless Mode<br>✅ Tools (WebSearch)<br>✅ LSP-Support<br>✅ Concurrent Runner                                                                              |
| Aufbau offener Fähigkeiten        | ✅ Custom Commands                                                                                                                                                                 | ✅ QwenCode SDK<br>✅ Extension System                                                                                                                                                  |
| Integration des Community-Ökosystems |                                                                                                                                                                                    | ✅ VSCode Plugin<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Administrative Funktionen         | ✅ Statistiken<br>✅ Feedback                                                                                                                                                            | Kosten<br>Dashboard<br>✅ User-Feedback-Dialog                                                                                                                                           |

> Weitere Details findest du in der folgenden Liste.

## Features

#### Abgeschlossene Features

| Feature                 | Version   | Beschreibung                                             | Kategorie                        | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Coding Plan**         | `V0.10.0` | Alibaba Cloud Coding Plan Authentifizierung & Modelle       | User Experience                 | 2     |
| Unified WebUI           | `V0.9.0`  | Gemeinsame WebUI-Komponentenbibliothek für VSCode/CLI           | User Experience                 | 2     |
| Export Chat             | `V0.8.0`  | Export von Sessions nach Markdown/HTML/JSON/JSONL             | User Experience                 | 2     |
| Extension System        | `V0.8.0`  | Vollständiges Extension-Management mit Slash Commands           | Aufbau offener Fähigkeiten      | 2     |
| LSP Support             | `V0.7.0`  | Experimenteller LSP-Service (`--experimental-lsp`)         | Coding Workflow                 | 2     |
| Anthropic Provider      | `V0.7.0`  | Unterstützung für Anthropic API Provider                          | User Experience                 | 2     |
| User Feedback Dialog    | `V0.7.0`  | In-App-Feedback-Erfassung mit Ermüdungsmechanismus       | Administrative Funktionen     | 2     |
| Concurrent Runner       | `V0.6.0`  | Batch-CLI-Ausführung mit Git-Integration                | Coding Workflow                 | 2     |
| Multimodal Input        | `V0.6.0`  | Unterstützung für Bild-, PDF-, Audio- und Videoeingaben                  | User Experience                 | 2     |
| Skill                   | `V0.6.0`  | Erweiterbare, benutzerdefinierte KI-Skills (experimentell)              | Coding Workflow                 | 2     |
| GitHub Actions          | `V0.5.0`  | qwen-code-action und Automatisierung                         | Integration des Community-Ökosystems | 1     |
| VSCode Plugin           | `V0.5.0`  | VSCode Extension Plugin                                 | Integration des Community-Ökosystems | 1     |
| QwenCode SDK            | `V0.4.0`  | Offenes SDK für Integration von Drittanbietern                    | Aufbau offener Fähigkeiten      | 1     |
| Session                 | `V0.4.0`  | Erweitertes Session-Management                             | User Experience                 | 1     |
| i18n                    | `V0.3.0`  | Internationalisierung und mehrsprachige Unterstützung           | User Experience                 | 1     |
| Headless Mode           | `V0.3.0`  | Headless Mode (nicht-interaktiv)                         | Coding Workflow                 | 1     |
| ACP/Zed                 | `V0.2.0`  | ACP- und Zed-Editor-Integration                          | Integration des Community-Ökosystems | 1     |
| Terminal UI             | `V0.1.0+` | Interaktive Terminal-Benutzeroberfläche                     | User Experience                 | 1     |
| Settings                | `V0.1.0+` | Konfigurationsverwaltungssystem                         | User Experience                 | 1     |
| Theme                   | `V0.1.0+` | Multi-Theme-Unterstützung                                     | User Experience                 | 1     |
| Support OpenAI Protocol | `V0.1.0+` | Unterstützung für das OpenAI API-Protokoll                         | User Experience                 | 1     |
| Chat Management         | `V0.1.0+` | Session-Management (Speichern, Wiederherstellen, Durchsuchen)              | Coding Workflow                 | 1     |
| MCP                     | `V0.1.0+` | Model Context Protocol Integration                      | Coding Workflow                 | 1     |
| Multi Model             | `V0.1.0+` | Multi-Modell-Unterstützung und -Wechsel                       | Coding Workflow                 | 1     |
| Slash Commands          | `V0.1.0+` | Slash-Command-System                                    | Coding Workflow                 | 1     |
| Tool: Bash              | `V0.1.0+` | Shell-Befehlsausführungstool (mit is_background-Parameter) | Coding Workflow                 | 1     |
| Tool: FileRead/EditFile | `V0.1.0+` | Tools zum Lesen/Schreiben und Bearbeiten von Dateien                          | Coding Workflow                 | 1     |
| Custom Commands         | `V0.1.0+` | Laden von benutzerdefinierten Commands                                  | Aufbau offener Fähigkeiten      | 1     |
| Feedback                | `V0.1.0+` | Feedback-Mechanismus (/bug Command)                       | Administrative Funktionen     | 1     |
| Stats                   | `V0.1.0+` | Nutzungsstatistiken und Quota-Anzeige                      | Administrative Funktionen     | 1     |
| Memory                  | `V0.0.9+` | Projekt- und globales Memory-Management              | User Experience                 | 1     |
| Cache Control           | `V0.0.9+` | Prompt-Caching-Steuerung (Anthropic, DashScope)           | User Experience                 | 1     |
| PlanMode                | `V0.0.14` | Aufgabenplanungsmodus                                      | Coding Workflow                 | 1     |
| Compress                | `V0.0.11` | Chat-Komprimierungsmechanismus                              | User Experience                 | 1     |
| SubAgent                | `V0.0.11` | Dediziertes Sub-Agent-System                              | Coding Workflow                 | 1     |
| TodoWrite               | `V0.0.10` | Aufgabenmanagement und Fortschrittsverfolgung                   | Coding Workflow                 | 1     |
| Tool: TextSearch        | `V0.0.8+` | Textsuch-Tool (grep, unterstützt .qwenignore)           | Coding Workflow                 | 1     |
| Tool: WebFetch          | `V0.0.7+` | Tool zum Abrufen von Webinhalten                               | Coding Workflow                 | 1     |
| Tool: WebSearch         | `V0.0.7+` | Web-Such-Tool (unter Verwendung der Tavily API)                      | Coding Workflow                 | 1     |
| OAuth                   | `V0.0.5+` | OAuth-Login-Authentifizierung (Qwen OAuth)                 | User Experience                 | 1     |

#### Zu entwickelnde Features

| Feature                      | Priorität | Status      | Beschreibung                       | Kategorie                    |
| ---------------------------- | -------- | ----------- | --------------------------------- | --------------------------- |
| Better UI                    | P1       | Geplant     | Optimierte Terminal-UI-Interaktion | User Experience             |
| OnBoarding                   | P1       | Geplant     | Onboarding-Flow für neue Nutzer          | User Experience             |
| Permission                   | P1       | Geplant     | Optimierung des Berechtigungssystems    | User Experience             |
| Cross-platform Compatibility | P1       | In Bearbeitung | Windows/Linux/macOS-Kompatibilität | User Experience             |
| LogView                      | P2       | Geplant     | Feature zur Log-Anzeige und Debugging | User Experience             |
| Hooks                        | P2       | In Bearbeitung | Extension-Hooks-System            | Coding Workflow             |
| Costs                        | P2       | Geplant     | Kostenverfolgung und -analyse        | Administrative Funktionen |
| Dashboard                    | P2       | Geplant     | Management-Dashboard              | Administrative Funktionen |

#### Besondere Features zur Diskussion

| Feature          | Status   | Beschreibung                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Research | Projektsuche und Schnellstart                    |
| Competitive Mode | Research | Wettbewerbsmodus                                      |
| Pulse            | Research | Pulsanalyse der Nutzeraktivität (Referenz: OpenAI Pulse) |
| Code Wiki        | Research | Wiki-/Dokumentationssystem für die Projekt-Codebasis            |