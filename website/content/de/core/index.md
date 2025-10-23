# Qwen Code Core

Das Core-Package von Qwen Code (`packages/core`) ist der Backend-Teil von Qwen Code. Es kümmert sich um die Kommunikation mit den Model-APIs, verwaltet Tools und verarbeitet Anfragen, die von `packages/cli` gesendet werden. Eine allgemeine Übersicht über Qwen Code findest du auf der [Hauptdokumentationsseite](../index.md).

## Navigation in diesem Bereich

- **[Core Tools API](./tools-api.md):** Informationen dazu, wie Tools definiert, registriert und vom Core verwendet werden.
- **[Memory Import Processor](./memport.md):** Dokumentation zur modularen QWEN.md-Importfunktion unter Verwendung der @file.md-Syntax.

## Rolle des Core

Während der `packages/cli`-Teil von Qwen Code die Benutzeroberfläche bereitstellt, ist `packages/core` verantwortlich für:

- **Modell-API-Interaktion:** Sichere Kommunikation mit dem konfigurierten Modellanbieter, Senden von Benutzeranfragen und Empfangen von Modellantworten.
- **Prompt Engineering:** Aufbau effektiver Prompts für das Modell, ggf. unter Einbeziehung des Konversationsverlaufs, Tool-Definitionen und instruktiven Kontexts aus Kontextdateien (z. B. `QWEN.md`).
- **Tool-Management & Orchestrierung:**
  - Registrierung verfügbarer Tools (z. B. Dateisystemtools, Shell-Befehlsausführung).
  - Interpretation von Tool-Nutzungsanfragen des Modells.
  - Ausführung der angeforderten Tools mit den übergebenen Argumenten.
  - Rückgabe der Tool-Ergebnisse an das Modell zur weiteren Verarbeitung.
- **Sitzungs- und Zustandsmanagement:** Verfolgung des Konversationszustands inklusive Verlauf und allen relevanten Kontextinformationen für kohärente Interaktionen.
- **Konfiguration:** Verwaltung kernspezifischer Einstellungen wie z. B. Zugriff auf API-Schlüssel, Modellauswahl und Tool-Einstellungen.

## Sicherheitsaspekte

Der Core spielt eine zentrale Rolle bei der Sicherheit:

- **API-Key-Management:** Er verwaltet die Provider-Zugangsdaten und stellt sicher, dass diese beim Kommunizieren mit APIs sicher verwendet werden.
- **Tool-Ausführung:** Wenn Tools mit dem lokalen System interagieren (z. B. `run_shell_command`), muss der Core (und die zugrunde liegenden Tool-Implementierungen) dies mit angemessener Vorsicht tun, oft unter Verwendung von Sandbox-Mechanismen, um unbeabsichtigte Änderungen zu verhindern.

## Komprimierung des Chatverlaufs

Um sicherzustellen, dass lange Gespräche die Token-Limits des ausgewählten Modells nicht überschreiten, enthält der Core eine Funktion zur Komprimierung des Chatverlaufs.

Wenn sich ein Gespräch dem Token-Limit des konfigurierten Modells nähert, komprimiert der Core den Gesprächsverlauf automatisch, bevor er an das Modell gesendet wird. Diese Komprimierung ist so gestaltet, dass sie informationsverlustfrei ist, reduziert aber die Gesamtanzahl der verwendeten Tokens.

Die Token-Limits für die Modelle der einzelnen Provider findest du in deren Dokumentation.

## Model-Fallback

Qwen Code enthält einen Model-Fallback-Mechanismus, um sicherzustellen, dass du die CLI auch dann weiter verwenden kannst, wenn das Standardmodell durch Ratenlimits eingeschränkt ist.

Wenn du das Standard-"pro"-Modell verwendest und die CLI feststellt, dass du durch Ratenlimits eingeschränkt wirst, wechselt sie automatisch für die aktuelle Sitzung zum "flash"-Modell. Dadurch kannst du deine Arbeit ohne Unterbrechung fortsetzen.

## File-Discovery-Service

Der File-Discovery-Service ist dafür verantwortlich, Dateien im Projekt zu finden, die für den aktuellen Kontext relevant sind. Er wird vom `@`-Befehl und anderen Tools verwendet, die Zugriff auf Dateien benötigen.

## Memory Discovery Service

Der Memory Discovery Service ist dafür verantwortlich, Kontextdateien (Standard: `QWEN.md`) zu finden und zu laden, die dem Modell zusätzlichen Kontext bereitstellen. Er sucht hierarchisch nach diesen Dateien – beginnend im aktuellen Arbeitsverzeichnis und weitergehend bis zum Projektstammverzeichnis sowie dem Home-Verzeichnis des Benutzers. Außerdem durchsucht er auch Unterverzeichnisse.

Das ermöglicht dir, globale, projektspezifische und komponentenspezifische Kontextdateien zu verwenden, welche dann kombiniert werden, um dem Modell die relevantesten Informationen zur Verfügung zu stellen.

Du kannst den [`/memory` Befehl](../cli/commands.md) nutzen, um den Inhalt der geladenen Kontextdateien anzuzeigen (`show`), hinzuzufügen (`add`) oder neu zu laden (`refresh`).