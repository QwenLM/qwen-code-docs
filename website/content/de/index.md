# Willkommen zur Qwen Code Dokumentation

Diese Dokumentation bietet einen umfassenden Leitfaden zur Installation, Nutzung und Entwicklung von Qwen Code. Dieses Tool ermöglicht es dir, über eine command-line interface mit KI-Modellen zu interagieren.

## Übersicht

Qwen Code bringt die Fähigkeiten fortschrittlicher Code-Modelle in dein Terminal, in Form einer interaktiven Read-Eval-Print Loop (REPL) Umgebung. Qwen Code besteht aus einer clientseitigen Anwendung (`packages/cli`), die mit einem lokalen Server (`packages/core`) kommuniziert. Qwen Code enthält außerdem verschiedene Tools für Aufgaben wie Dateisystemoperationen, Shell-Befehle ausführen und Web-Fetching, welche vom `packages/core` verwaltet werden.

## Navigation in der Dokumentation

Diese Dokumentation ist in folgende Abschnitte unterteilt:

- **[Ausführung und Deployment](./deployment.md):** Informationen zum Ausführen von Qwen Code.
- **[Architekturübersicht](./architecture.md):** Verständnis des High-Level Designs von Qwen Code, einschließlich seiner Komponenten und deren Interaktion.
- **CLI-Nutzung:** Dokumentation für `packages/cli`.
  - **[CLI-Einführung](./cli/index.md):** Übersicht über das Command-Line Interface.
  - **[Befehle](./cli/commands.md):** Beschreibung der verfügbaren CLI-Befehle.
  - **[Konfiguration](./cli/configuration.md):** Informationen zur Konfiguration der CLI.
  - **[Checkpointing](./checkpointing.md):** Dokumentation zur Checkpointing-Funktion.
  - **[Erweiterungen](./extension.md):** Wie du die CLI mit neuer Funktionalität erweiterst.
  - **[IDE-Integration](./ide-integration.md):** Verbinde die CLI mit deinem Editor.
  - **[Telemetrie](./telemetry.md):** Übersicht zur Telemetrie in der CLI.
- **Core-Details:** Dokumentation für `packages/core`.
  - **[Core-Einführung](./core/index.md):** Übersicht über die Core-Komponente.
  - **[Tools-API](./core/tools-api.md):** Informationen darüber, wie der Core Tools verwaltet und bereitstellt.
- **Tools:**
  - **[Tools-Übersicht](./tools/index.md):** Überblick über die verfügbaren Tools.
  - **[Dateisystem-Tools](./tools/file-system.md):** Dokumentation zu den `read_file`- und `write_file`-Tools.
  - **[Multi-File Read Tool](./tools/multi-file.md):** Dokumentation zum `read_many_files`-Tool.
  - **[Shell-Tool](./tools/shell.md):** Dokumentation zum `run_shell_command`-Tool.
  - **[Web Fetch Tool](./tools/web-fetch.md):** Dokumentation zum `web_fetch`-Tool.
  - **[Web Search Tool](./tools/web-search.md):** Dokumentation zum `web_search`-Tool.
  - **[Memory Tool](./tools/memory.md):** Dokumentation zum `save_memory`-Tool.
- **[Subagents](./subagents.md):** Spezialisierte KI-Assistenten für fokussierte Aufgaben mit umfassender Verwaltung, Konfiguration und Nutzungshinweisen.
- **[Beitragen & Entwicklerhandbuch](../CONTRIBUTING.md):** Informationen für Mitwirkende und Entwickler, inklusive Setup, Build-Prozess, Tests und Coding-Standards.
- **[NPM](./npm.md):** Details zur Struktur der Projekt-Pakete.
- **[Fehlerbehebung](./troubleshooting.md):** Lösungen für häufig auftretende Probleme und FAQs.
- **[Allgemeine Geschäftsbedingungen und Datenschutzhinweise](./tos-privacy.md):** Informationen zu den Allgemeinen Geschäftsbedingungen und Datenschutzhinweisen, die bei der Nutzung von Qwen Code gelten.

Wir hoffen, diese Dokumentation hilft dir dabei, das Beste aus Qwen Code herauszuholen!