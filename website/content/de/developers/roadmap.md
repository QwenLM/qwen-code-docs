# Qwen Code-Roadmap

> **Ziel**: Die Funktionalität von Claude Code einzuholen, Details kontinuierlich zu verfeinern und die Benutzererfahrung zu verbessern.

| Kategorie                       | Phase 1                                                                                                                                                                            | Phase 2                                                                                                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Benutzererfahrung               | ✅ Terminal-Benutzeroberfläche<br>✅ Unterstützung des OpenAI-Protokolls<br>✅ Einstellungen<br>✅ OAuth<br>✅ Cache-Steuerung<br>✅ Speicher<br>✅ Komprimierung<br>✅ Thema         | Verbesserte Benutzeroberfläche<br>Onboarding<br>LogView<br>✅ Sitzung<br>Berechtigungen<br>🔄 Plattformübergreifende Kompatibilität<br>✅ Codierungsplan<br>✅ Anthropic-Anbieter<br>✅ Multimodale Eingabe<br>✅ Einheitliche Web-Oberfläche |
| Codierungs-Workflow             | ✅ Slash-Befehle<br>✅ MCP<br>✅ PlanModus<br>✅ TodoWrite<br>✅ Sub-Agent<br>✅ Mehrere Modelle<br>✅ Chat-Verwaltung<br>✅ Tools (WebFetch, Bash, TextSearch, FileReadFile, EditFile) | 🔄 Hooks<br>✅ Skill<br>✅ Headless-Modus<br>✅ Tools (WebSearch)<br>✅ LSP-Unterstützung<br>✅ Parallel-Runner                                                                              |
| Aufbau offener Funktionen       | ✅ Benutzerdefinierte Befehle                                                                                                                                                      | ✅ QwenCode-SDK<br>✅ Erweiterungssystem                                                                                                                                                 |
| Integration des Community-Ökosystems |                                                                                                                                                                                    | ✅ VSCode-Plugin<br>✅ ACP/Zed<br>✅ GHA                                                                                                                                                |
| Verwaltungsfunktionen           | ✅ Statistiken<br>✅ Feedback                                                                                                                                                        | Kosten<br>Dashboard<br>✅ Dialog zur Nutzerfeedback-Erfassung                                                                                                                            |

> Weitere Details finden Sie in der folgenden Liste.

## Funktionen

#### Abgeschlossene Funktionen

| Funktion                | Version   | Beschreibung                                            | Kategorie                       | Phase |
| ----------------------- | --------- | ------------------------------------------------------- | ------------------------------- | ----- |
| **Codierungsplan**      | `V0.10.0` | Authentifizierung und Modelle für den Alibaba Cloud-Codierungsplan | Benutzererfahrung               | 2     |
| Vereinheitlichtes WebUI | `V0.9.0`  | Gemeinsame WebUI-Komponentenbibliothek für VSCode/CLI   | Benutzererfahrung               | 2     |
| Chat exportieren        | `V0.8.0`  | Sitzungen in Markdown/HTML/JSON/JSONL exportieren      | Benutzererfahrung               | 2     |
| Erweiterungssystem      | `V0.8.0`  | Vollständiges Erweiterungsmanagement mit Slash-Befehlen | Offene Fähigkeiten erweitern    | 2     |
| LSP-Unterstützung       | `V0.7.0`  | Experimenteller LSP-Dienst (`--experimental-lsp`)         | Codierungsworkflow              | 2     |
| Anthropic-Anbieter      | `V0.7.0`  | Unterstützung für die Anthropic-API                     | Benutzererfahrung               | 2     |
| Benutzerfeedbackdialog  | `V0.7.0`  | In-App-Feedback-Sammlung mit Ermüdungsmechanismus       | Verwaltungsfunktionen           | 2     |
| Parallel-Runner         | `V0.6.0`  | Batch-Ausführung über CLI mit Git-Integration           | Codierungsworkflow              | 2     |
| Multimodale Eingabe     | `V0.6.0`  | Unterstützung für Bild-, PDF-, Audio- und Videoeingaben | Benutzererfahrung               | 2     |
| Skill                   | `V0.6.0`  | Erweiterbare benutzerdefinierte KI-Skills (experimentell) | Codierungsworkflow              | 2     |
| GitHub Actions          | `V0.5.0`  | `qwen-code-action` und Automatisierung                  | Integration des Community-Ökosystems | 1     |
| VSCode-Plugin           | `V0.5.0`  | VSCode-Erweiterungsplugin                               | Integration des Community-Ökosystems | 1     |
| QwenCode SDK            | `V0.4.0`  | Offenes SDK für Integration durch Drittanbieter         | Offene Fähigkeiten erweitern    | 1     |
| Sitzung                 | `V0.4.0`  | Verbessertes Sitzungsmanagement                         | Benutzererfahrung               | 1     |
| Internationalisierung (i18n) | `V0.3.0`  | Internationalisierung und mehrsprachige Unterstützung   | Benutzererfahrung               | 1     |
| Headless-Modus          | `V0.3.0`  | Headless-Modus (nicht interaktiv)                       | Codierungsworkflow              | 1     |
| ACP/Zed                 | `V0.2.0`  | Integration von ACP- und Zed-Editoren                  | Integration des Community-Ökosystems | 1     |
| Terminal-Benutzeroberfläche | `V0.1.0+` | Interaktive Terminal-Benutzeroberfläche                 | Benutzererfahrung               | 1     |
| Einstellungen           | `V0.1.0+` | Konfigurationsverwaltungssystem                         | Benutzererfahrung               | 1     |
| Design                  | `V0.1.0+` | Unterstützung für mehrere Designs                       | Benutzererfahrung               | 1     |
| OpenAI-Protokoll unterstützen | `V0.1.0+` | Unterstützung für das OpenAI-API-Protokoll             | Benutzererfahrung               | 1     |
| Chat-Verwaltung         | `V0.1.0+` | Sitzungsverwaltung (speichern, wiederherstellen, durchsuchen) | Codierungsworkflow              | 1     |
| MCP                     | `V0.1.0+` | Integration des Model Context Protocol                  | Codierungsworkflow              | 1     |
| Mehrere Modelle         | `V0.1.0+` | Unterstützung für mehrere Modelle und Modellwechsel     | Codierungsworkflow              | 1     |
| Slash-Befehle           | `V0.1.0+` | Slash-Befehlssystem                                       | Codierungsworkflow              | 1     |
| Tool: Bash              | `V0.1.0+` | Ausführung von Shell-Befehlen (mit Parameter `is_background`) | Codierungsworkflow              | 1     |
| Tool: FileRead/EditFile | `V0.1.0+` | Tools zum Lesen/Schreiben und Bearbeiten von Dateien    | Codierungsworkflow              | 1     |
| Benutzerdefinierte Befehle | `V0.1.0+` | Laden benutzerdefinierter Befehle                        | Offene Fähigkeiten erweitern    | 1     |
| Feedback                | `V0.1.0+` | Feedback-Mechanismus (`/bug`-Befehl)                    | Verwaltungsfunktionen           | 1     |
| Statistiken             | `V0.1.0+` | Nutzungsstatistiken und Kontingentsanzeige              | Verwaltungsfunktionen           | 1     |
| Speicher                | `V0.0.9+` | Projektübergreifendes und globales Speichermanagement   | Benutzererfahrung               | 1     |
| Cache-Steuerung         | `V0.0.9+` | Steuerung der Prompt-Caching-Funktion (Anthropic, DashScope) | Benutzererfahrung               | 1     |
| PlanMode                | `V0.0.14` | Modus zur Aufgabenplanung                               | Codierungsworkflow              | 1     |
| Komprimierung           | `V0.0.11` | Mechanismus zur Komprimierung von Chats                 | Benutzererfahrung               | 1     |
| Sub-Agent               | `V0.0.11` | Dediziertes Sub-Agent-System                            | Codierungsworkflow              | 1     |
| TodoWrite               | `V0.0.10` | Aufgabenverwaltung und Fortschrittsverfolgung           | Codierungsworkflow              | 1     |
| Tool: TextSearch        | `V0.0.8+` | Textsuchtool (grep, unterstützt `.qwenignore`)          | Codierungsworkflow              | 1     |
| Tool: WebFetch          | `V0.0.7+` | Tool zum Abrufen von Webinhalt                          | Codierungsworkflow              | 1     |
| Tool: WebSearch         | `V0.0.7+` | Websuchtool (mithilfe der Tavily-API)                   | Codierungsworkflow              | 1     |
| OAuth                   | `V0.0.5+` | OAuth-Anmeldeauthentifizierung (Qwen OAuth)             | Benutzererfahrung               | 1     |

#### Zu entwickelnde Funktionen

| Funktion                     | Priorität | Status      | Beschreibung                                 | Kategorie                   |
| ---------------------------- | --------- | ----------- | -------------------------------------------- | --------------------------- |
| Verbesserte Benutzeroberfläche | P1        | Geplant     | Optimierte Interaktion mit der Terminal-Benutzeroberfläche | Benutzererfahrung           |
| Onboarding                   | P1        | Geplant     | Onboarding-Workflow für neue Benutzer       | Benutzererfahrung           |
| Berechtigungen               | P1        | Geplant     | Optimierung des Berechtigungssystems        | Benutzererfahrung           |
| Plattformübergreifende Kompatibilität | P1        | In Arbeit  | Kompatibilität mit Windows/Linux/macOS      | Benutzererfahrung           |
| Log-Ansicht                  | P2        | Geplant     | Funktion zum Anzeigen und Debuggen von Logs | Benutzererfahrung           |
| Hooks                        | P2        | In Arbeit  | Erweiterungshook-System                      | Codierungs-Workflow         |
| Kosten                       | P2        | Geplant     | Kostenverfolgung und -analyse                | Verwaltungsfunktionen       |
| Dashboard                    | P2        | Geplant     | Verwaltungs-Dashboard                        | Verwaltungsfunktionen       |

#### Besondere Merkmale zur Diskussion

| Merkmal            | Status   | Beschreibung                                           |
| ------------------ | -------- | ------------------------------------------------------ |
| Startseite-Highlight | Recherche | Projektentdeckung und schneller Start                  |
| Wettbewerbsmodus   | Recherche | Modus für Wettkämpfe                                   |
| Pulse              | Recherche | Analyse der Nutzeraktivität (Anlehnung an OpenAI Pulse) |
| Code-Wiki          | Recherche | Wiki-/Dokumentationssystem für den Projektcode         |