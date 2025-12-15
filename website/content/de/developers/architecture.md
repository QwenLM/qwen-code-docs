# Qwen Code Architekturübersicht

Dieses Dokument bietet eine Übersicht auf hoher Ebene über die Architektur von Qwen Code.

## Kernkomponenten

Qwen Code besteht hauptsächlich aus zwei Hauptpaketen sowie einer Reihe von Tools, die vom System bei der Verarbeitung von Befehlszeileneingaben verwendet werden können:

### 1. CLI-Paket (`packages/cli`)

**Zweck:** Dieses Paket enthält den benutzerseitigen Teil von Qwen Code, wie die Verarbeitung der ursprünglichen Benutzereingabe, die Darstellung der endgültigen Ausgabe und das Management der gesamten Benutzererfahrung.

**Wichtige Funktionen:**

- **Eingabeverarbeitung:** Verarbeitet Benutzereingaben über verschiedene Methoden, darunter direkte Texteingabe, Schrägstrich-Befehle (z. B. `/help`, `/clear`, `/model`), At-Befehle (`@file` zum Einbinden von Dateiinhalten) und Ausrufezeichen-Befehle (`!command` zur Shell-Ausführung).
- **Verwaltung des Verlaufs:** Führt den Konversationsverlauf und ermöglicht Funktionen wie das Fortsetzen von Sitzungen.
- **Anzeige-Rendering:** Formatiert und präsentiert Antworten im Terminal mit Syntaxhervorhebung und korrekter Formatierung.
- **Design- und UI-Anpassung:** Unterstützt anpassbare Designs und UI-Elemente für ein personalisiertes Erlebnis.
- **Konfigurationseinstellungen:** Verwaltet verschiedene Konfigurationsoptionen über JSON-Einstellungsdateien, Umgebungsvariablen und Befehlszeilenargumente.

### 2. Core-Paket (`packages/core`)

**Zweck:** Dieses Paket fungiert als Backend für Qwen Code. Es empfängt Anfragen, die von `packages/cli` gesendet werden, orchestriert Interaktionen mit der konfigurierten Modell-API und verwaltet die Ausführung verfügbarer Tools.

**Wichtige Funktionen:**

- **API-Client:** Kommuniziert mit der Qwen-Modell-API, um Prompts zu senden und Antworten zu erhalten.
- **Prompt-Konstruktion:** Erstellt geeignete Prompts für das Modell unter Einbeziehung des Konversationsverlaufs und verfügbarer Tool-Definitionen.
- **Tool-Registrierung und -Ausführung:** Verwaltet die Registrierung verfügbarer Tools und führt diese basierend auf Anfragen des Modells aus.
- **Zustandsverwaltung:** Speichert Informationen zum Konversations- und Sitzungsstatus.
- **Serverseitige Konfiguration:** Bearbeitet serverseitige Konfigurationen und Einstellungen.

### 3. Tools (`packages/core/src/tools/`)

**Zweck:** Dies sind einzelne Module, die die Fähigkeiten des Qwen-Modells erweitern und ihm ermöglichen, mit der lokalen Umgebung zu interagieren (z. B. Dateisystem, Shell-Befehle, Webabrufe).

**Interaktion:** `packages/core` ruft diese Tools basierend auf Anfragen des Qwen-Modells auf.

**Häufig verwendete Tools umfassen:**

- **Dateioperationen:** Lesen, Schreiben und Bearbeiten von Dateien
- **Shell-Befehle:** Ausführen von Systembefehlen mit Benutzerbestätigung für potenziell gefährliche Operationen
- **Suchwerkzeuge:** Finden von Dateien und Durchsuchen von Inhalten innerhalb des Projekts
- **Webtools:** Abrufen von Inhalten aus dem Web
- **MCP-Integration:** Verbinden mit Model Context Protocol-Servern zur Erweiterung der Funktionen

## Interaktionsablauf

Eine typische Interaktion mit Qwen Code folgt diesem Ablauf:

1.  **Benutzereingabe:** Der Benutzer gibt einen Prompt oder Befehl im Terminal ein, der von `packages/cli` verwaltet wird.
2.  **Anfrage an den Core:** `packages/cli` sendet die Eingabe des Benutzers an `packages/core`.
3.  **Verarbeitung der Anfrage:** Das Core-Paket:
    - Erstellt einen geeigneten Prompt für die konfigurierte Modell-API, möglicherweise inklusive Konversationsverlauf und verfügbarer Tool-Definitionen.
    - Sendet den Prompt an die Modell-API.
4.  **Antwort der Modell-API:** Die Modell-API verarbeitet den Prompt und gibt eine Antwort zurück. Diese Antwort kann eine direkte Antwort oder eine Anforderung zur Nutzung eines der verfügbaren Tools sein.
5.  **Ausführung des Tools (falls zutreffend):**
    - Wenn die Modell-API ein Tool anfordert, bereitet das Core-Paket dessen Ausführung vor.
    - Falls das angeforderte Tool das Dateisystem ändern oder Shell-Befehle ausführen kann, erhält der Benutzer zunächst Details zum Tool und dessen Argumenten und muss die Ausführung genehmigen.
    - Reine Leseoperationen wie das Lesen von Dateien erfordern möglicherweise keine explizite Bestätigung durch den Benutzer.
    - Nach Bestätigung oder falls keine Bestätigung erforderlich ist, führt das Core-Paket die entsprechende Aktion innerhalb des relevanten Tools aus, und das Ergebnis wird vom Core-Paket an die Modell-API zurückgesendet.
    - Die Modell-API verarbeitet das Tool-Ergebnis und generiert eine endgültige Antwort.
6.  **Rückmeldung an die CLI:** Das Core-Paket sendet die endgültige Antwort zurück an das CLI-Paket.
7.  **Anzeige für den Benutzer:** Das CLI-Paket formatiert die Antwort und zeigt sie dem Benutzer im Terminal an.

## Konfigurationsoptionen

Qwen Code bietet mehrere Möglichkeiten, sein Verhalten zu konfigurieren:

### Konfigurationsebenen (in Reihenfolge der Priorität)

1. Befehlszeilenargumente
2. Umgebungsvariablen
3. Projekteinstellungsdatei (`.qwen/settings.json`)
4. Benutzereinstellungsdatei (`~/.qwen/settings.json`)
5. Systemeinstellungsdateien
6. Standardwerte

### Wichtige Konfigurationskategorien

- **Allgemeine Einstellungen:** Vim-Modus, bevorzugter Editor, Auto-Update-Einstellungen
- **UI-Einstellungen:** Theme-Anpassung, Sichtbarkeit von Bannern, Footer-Anzeige
- **Modelleinstellungen:** Modellauswahl, Limits für Sitzungsdurchgänge, Komprimierungseinstellungen
- **Kontexteinstellungen:** Kontextdateinamen, Verzeichnisinklusion, Dateifilterung
- **Tool-Einstellungen:** Genehmigungsmodi, Sandboxing, Tool-Einschränkungen
- **Datenschutzeinstellungen:** Sammlung von Nutzungsstatistiken
- **Erweiterte Einstellungen:** Debug-Optionen, benutzerdefinierte Fehlerberichtsbefehle

## Wichtige Designprinzipien

- **Modularität:** Die Trennung der CLI (Frontend) vom Core (Backend) ermöglicht eine unabhängige Entwicklung und potenzielle zukünftige Erweiterungen (z. B. verschiedene Frontends für dasselbe Backend).
- **Erweiterbarkeit:** Das Tool-System ist so konzipiert, dass es erweiterbar ist und neue Funktionen durch benutzerdefinierte Tools oder die Integration von MCP-Servern hinzugefügt werden können.
- **Benutzererfahrung:** Die CLI konzentriert sich darauf, eine umfangreiche und interaktive Terminal-Erfahrung mit Funktionen wie Syntaxhervorhebung, anpassbaren Themes und intuitiven Befehlsstrukturen zu bieten.
- **Sicherheit:** Implementiert Genehmigungsmechanismen für potenziell gefährliche Operationen sowie Sandbox-Optionen zum Schutz des Benutzersystems.
- **Flexibilität:** Unterstützt mehrere Konfigurationsmethoden und kann sich an verschiedene Workflows und Umgebungen anpassen.