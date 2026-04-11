# Qwen Code Roadmap

> **Ziel**: Die Produktfunktionalität von Claude Code aufholen, Details kontinuierlich verfeinern und die Benutzererfahrung verbessern.

| Kategorie                        | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benutzererfahrung                 | ✅ Terminal UI<br>✅ Support OpenAI Protocol<br>✅ Settings<br>✅ OAuth<br>✅ Cache Control<br>✅ Memory<br>✅ Compress<br>✅ Theme                                                | Better UI<br>OnBoarding<br>LogView<br>✅ Session<br>Permission<br>🔄 Cross-platform Compatibility<br>✅ Coding Plan<br>✅ Anthropic Provider<br>✅ Multimodal Input<br>✅ Unified WebUI |
| Code-Workflow                 | ✅ Slash Commands<br>✅ MCP<br>✅ PlanMode<br>✅ TodoWrite<br>✅ SubAgent<br>✅ Multi Model<br>✅ Chat Management<br>✅ Tools (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Headless Mode<br>✅ Tools (WebSearch)<br>✅ LSP Support<br>✅ Concurrent Runner                                                                              |
| Offene Funktionen      | ✅ Custom Commands                                                                                                                                                                 | ✅ QwenCode SDK<br>✅ Extension System                                                                                                                                                  |
| Community-Ökosystem |                                                                                                                                                                                    | ✅ VSCode Plugin<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Administrative Funktionen     | ✅ Stats<br>✅ Feedback                                                                                                                                                            | Costs<br>Dashboard<br>✅ User Feedback Dialog                                                                                                                                           |

> Weitere Details findest du in der folgenden Liste.

## Funktionen

#### Abgeschlossene Funktionen

| Funktion                 | Version   | Beschreibung                                             | Kategorie                        | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Coding Plan**         | `V0.10.0` | Authentifizierung & Modelle für Alibaba Cloud Coding Plan       | Benutzererfahrung                 | 2     |
| Unified WebUI           | `V0.9.0`  | Gemeinsame WebUI-Komponentenbibliothek für VSCode/CLI           | Benutzererfahrung                 | 2     |
| Export Chat             | `V0.8.0`  | Export von Sessions nach Markdown/HTML/JSON/JSONL             | Benutzererfahrung                 | 2     |
| Extension System        | `V0.8.0`  | Vollständiges Erweiterungsmanagement mit Slash-Befehlen           | Offene Funktionen      | 2     |
| LSP Support             | `V0.7.0`  | Experimenteller LSP-Service (`--experimental-lsp`)         | Code-Workflow                 | 2     |
| Anthropic Provider      | `V0.7.0`  | Unterstützung des Anthropic API-Providers                          | Benutzererfahrung                 | 2     |
| User Feedback Dialog    | `V0.7.0`  | In-App-Feedback-Erfassung mit Ermüdungsmechanismus       | Administrative Funktionen     | 2     |
| Concurrent Runner       | `V0.6.0`  | Batch-CLI-Ausführung mit Git-Integration                | Code-Workflow                 | 2     |
| Multimodal Input        | `V0.6.0`  | Unterstützung für Bild-, PDF-, Audio- und Videoeingaben                  | Benutzererfahrung                 | 2     |
| Skill                   | `V0.6.0`  | Erweiterbare benutzerdefinierte AI-Skills (experimentell)              | Code-Workflow                 | 2     |
| Github Actions          | `V0.5.0`  | qwen-code-action und Automatisierung                         | Community-Ökosystem | 1     |
| VSCode Plugin           | `V0.5.0`  | VSCode-Erweiterungs-Plugin                                 | Community-Ökosystem | 1     |
| QwenCode SDK            | `V0.4.0`  | Offenes SDK für Integrationen von Drittanbietern                    | Offene Funktionen      | 1     |
| Session                 | `V0.4.0`  | Erweitertes Session-Management                             | Benutzererfahrung                 | 1     |
| i18n                    | `V0.3.0`  | Internationalisierung und mehrsprachige Unterstützung           | Benutzererfahrung                 | 1     |
| Headless Mode           | `V0.3.0`  | Headless-Modus (nicht-interaktiv)                         | Code-Workflow                 | 1     |
| ACP/Zed                 | `V0.2.0`  | Integration von ACP und Zed Editor                          | Community-Ökosystem | 1     |
| Terminal UI             | `V0.1.0+` | Interaktive Terminal-Benutzeroberfläche                     | Benutzererfahrung                 | 1     |
| Settings                | `V0.1.0+` | Konfigurationsmanagementsystem                         | Benutzererfahrung                 | 1     |
| Theme                   | `V0.1.0+` | Unterstützung mehrerer Themes                                     | Benutzererfahrung                 | 1     |
| Support OpenAI Protocol | `V0.1.0+` | Unterstützung des OpenAI API-Protokolls                         | Benutzererfahrung                 | 1     |
| Chat Management         | `V0.1.0+` | Session-Management (Speichern, Wiederherstellen, Durchsuchen)              | Code-Workflow                 | 1     |
| MCP                     | `V0.1.0+` | Integration des Model Context Protocol                      | Code-Workflow                 | 1     |
| Multi Model             | `V0.1.0+` | Unterstützung und Wechsel zwischen mehreren Modellen                       | Code-Workflow                 | 1     |
| Slash Commands          | `V0.1.0+` | Slash-Befehlssystem                                    | Code-Workflow                 | 1     |
| Tool: Bash              | `V0.1.0+` | Tool zur Ausführung von Shell-Befehlen (mit `is_background`-Parameter) | Code-Workflow                 | 1     |
| Tool: FileRead/EditFile | `V0.1.0+` | Tools zum Lesen/Schreiben und Bearbeiten von Dateien                          | Code-Workflow                 | 1     |
| Custom Commands         | `V0.1.0+` | Laden benutzerdefinierter Befehle                                  | Offene Funktionen      | 1     |
| Feedback                | `V0.1.0+` | Feedback-Mechanismus (`/bug`-Befehl)                       | Administrative Funktionen     | 1     |
| Stats                   | `V0.1.0+` | Nutzungsstatistiken und Kontingentanzeige                      | Administrative Funktionen     | 1     |
| Memory                  | `V0.0.9+` | Projekt- und globales Memory-Management              | Benutzererfahrung                 | 1     |
| Cache Control           | `V0.0.9+` | Steuerung des Prompt-Cachings (Anthropic, DashScope)           | Benutzererfahrung                 | 1     |
| PlanMode                | `V0.0.14` | Modus für Aufgabenplanung                                      | Code-Workflow                 | 1     |
| Compress                | `V0.0.11` | Mechanismus zur Chat-Komprimierung                              | Benutzererfahrung                 | 1     |
| SubAgent                | `V0.0.11` | Dediziertes Sub-Agent-System                              | Code-Workflow                 | 1     |
| TodoWrite               | `V0.0.10` | Aufgabenmanagement und Fortschrittsverfolgung                   | Code-Workflow                 | 1     |
| Tool: TextSearch        | `V0.0.8+` | Textsuch-Tool (grep, unterstützt `.qwenignore`)           | Code-Workflow                 | 1     |
| Tool: WebFetch          | `V0.0.7+` | Tool zum Abrufen von Webinhalten                               | Code-Workflow                 | 1     |
| Tool: WebSearch         | `V0.0.7+` | Websuch-Tool (unter Verwendung der Tavily API)                      | Code-Workflow                 | 1     |
| OAuth                   | `V0.0.5+` | OAuth-Login-Authentifizierung (Qwen OAuth)                 | Benutzererfahrung                 | 1     |

#### Geplante Funktionen

| Funktion                      | Priorität | Status      | Beschreibung                       | Kategorie                    |
| ---------------------------- | -------- | ----------- | --------------------------------- | --------------------------- |
| Better UI                    | P1       | Geplant     | Optimierte Terminal-UI-Interaktion | Benutzererfahrung             |
| OnBoarding                   | P1       | Geplant     | Onboarding-Flow für neue Benutzer          | Benutzererfahrung             |
| Permission                   | P1       | Geplant     | Optimierung des Berechtigungssystems    | Benutzererfahrung             |
| Cross-platform Compatibility | P1       | In Bearbeitung | Kompatibilität mit Windows/Linux/macOS | Benutzererfahrung             |
| LogView                      | P2       | Geplant     | Funktion zum Anzeigen und Debuggen von Logs | Benutzererfahrung             |
| Hooks                        | P2       | In Bearbeitung | Hooks-System für Erweiterungen            | Code-Workflow             |
| Costs                        | P2       | Geplant     | Kostenverfolgung und -analyse        | Administrative Funktionen |
| Dashboard                    | P2       | Geplant     | Verwaltungs-Dashboard              | Administrative Funktionen |

#### Besondere Funktionen zur Diskussion

| Funktion          | Status   | Beschreibung                                           |
| ---------------- | -------- | ----------------------------------------------------- |
| Home Spotlight   | Recherche | Projektentdeckung und Schnellstart                    |
| Competitive Mode | Recherche | Wettbewerbsmodus                                      |
| Pulse            | Recherche | Analyse des Nutzeraktivitäts-Pulses (Referenz: OpenAI Pulse) |
| Code Wiki        | Recherche | Wiki-/Dokumentationssystem für die Projekt-Codebase            |