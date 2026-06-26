# Qwen Code Architekturüberblick

Dieses Dokument bietet einen allgemeinen Überblick über die Architektur von Qwen Code.

## Kernkomponenten

Qwen Code besteht hauptsächlich aus zwei Hauptpaketen sowie einer Reihe von Tools, die vom System im Rahmen der Verarbeitung von Kommandozeileneingaben verwendet werden können:

### 1. CLI-Paket (`packages/cli`)

**Zweck:** Dies enthält den benutzerseitigen Teil von Qwen Code, wie die Verarbeitung der anfänglichen Benutzereingabe, die Darstellung der endgültigen Ausgabe und die Verwaltung der gesamten Benutzererfahrung.

**Hauptfunktionen:**

- **Eingabeverarbeitung:** Verarbeitet Benutzereingaben über verschiedene Methoden, darunter direkte Texteingabe, Slash-Befehle (z. B. `/help`, `/clear`, `/model`), At-Befehle (`@file` zum Einfügen von Dateiinhalten) und Ausrufezeichen-Befehle (`!command` zur Shell-Ausführung).
- **Verwaltung des Verlaufs:** Pflegt den Gesprächsverlauf und ermöglicht Funktionen wie das Wiederaufnehmen von Sitzungen.
- **Ausgabedarstellung:** Formatiert und präsentiert Antworten an den Benutzer im Terminal mit Syntaxhervorhebung und korrekter Formatierung.
- **Anpassung von Design und Benutzeroberfläche:** Unterstützt anpassbare Designs und UI-Elemente für ein personalisiertes Erlebnis.
- **Konfigurationseinstellungen:** Verwaltet verschiedene Konfigurationsoptionen über JSON-Einstellungsdateien, Umgebungsvariablen und Befehlszeilenargumente.

### 2. Kernpaket (`packages/core`)

**Zweck:** Dies fungiert als Backend für Qwen Code. Es empfängt Anfragen von `packages/cli`, orchestriert Interaktionen mit der konfigurierten Modell-API und verwaltet die Ausführung verfügbarer Tools.

**Hauptfunktionen:**

- **API-Client:** Kommuniziert mit der Qwen-Modell-API, um Prompts zu senden und Antworten zu empfangen.
- **Erstellung von Prompts:** Baut geeignete Prompts für das Modell unter Einbeziehung des Gesprächsverlaufs und der verfügbaren Tool-Definitionen auf.
- **Registrierung und Ausführung von Tools:** Verwaltet die Registrierung verfügbarer Tools und führt sie basierend auf Modellanfragen aus.
- **Zustandsverwaltung:** Pflegt Informationen zum Gesprächs- und Sitzungsstatus.
- **Serverseitige Konfiguration:** Behandelt serverseitige Konfiguration und Einstellungen.

### 3. Tools (`packages/core/src/tools/`)

**Zweck:** Dies sind einzelne Module, die die Fähigkeiten des Qwen-Modells erweitern, sodass es mit der lokalen Umgebung interagieren kann (z. B. Dateisystem, Shell-Befehle, Webabrufe).

**Interaktion:** `packages/core` ruft diese Tools basierend auf Anfragen des Qwen-Modells auf.

**Häufig verwendete Tools sind:**

- **Dateioperationen:** Lesen, Schreiben und Bearbeiten von Dateien
- **Shell-Befehle:** Ausführen von Systembefehlen mit Benutzerfreigabe für potenziell gefährliche Operationen
- **Such-Tools:** Finden von Dateien und Durchsuchen von Inhalten innerhalb des Projekts
- **Web-Tools:** Abrufen von Inhalten aus dem Web
- **MCP-Integration:** Verbindung zu Model Context Protocol Servern für erweiterte Fähigkeiten

## Interaktionsablauf

Eine typische Interaktion mit Qwen Code folgt diesem Ablauf:

1.  **Benutzereingabe:** Der Benutzer gibt eine Eingabeaufforderung oder einen Befehl im Terminal ein, die von `packages/cli` verwaltet wird.
2.  **Anfrage an Core:** `packages/cli` sendet die Benutzereingabe an `packages/core`.
3.  **Anfrageverarbeitung:** Das Kernpaket:
    - Erstellt einen geeigneten Prompt für die konfigurierte Modell-API, möglicherweise unter Einbeziehung des Gesprächsverlaufs und der verfügbaren Tool-Definitionen.
    - Sendet den Prompt an die Modell-API.
4.  **Antwort der Modell-API:** Die Modell-API verarbeitet den Prompt und gibt eine Antwort zurück. Diese Antwort kann eine direkte Antwort oder eine Anfrage zur Verwendung eines der verfügbaren Tools sein.
5.  **Tool-Ausführung (falls zutreffend):**
    - Wenn die Modell-API ein Tool anfordert, bereitet das Kernpaket dessen Ausführung vor.
    - Kann das angeforderte Tool das Dateisystem ändern oder Shell-Befehle ausführen, erhält der Benutzer zunächst Details zum Tool und seinen Argumenten und muss die Ausführung genehmigen.
    - Schreibgeschützte Operationen wie das Lesen von Dateien erfordern möglicherweise keine explizite Benutzerbestätigung.
    - Sobald die Bestätigung erfolgt ist (oder nicht erforderlich ist), führt das Kernpaket die entsprechende Aktion im entsprechenden Tool aus, und das Ergebnis wird vom Kernpaket an die Modell-API zurückgesendet.
    - Die Modell-API verarbeitet das Tool-Ergebnis und erzeugt eine endgültige Antwort.
6.  **Antwort an CLI:** Das Kernpaket sendet die endgültige Antwort zurück an das CLI-Paket.
7.  **Anzeige für den Benutzer:** Das CLI-Paket formatiert und zeigt die Antwort dem Benutzer im Terminal an.

## Konfigurationsoptionen

Qwen Code bietet mehrere Möglichkeiten zur Konfiguration seines Verhaltens:

### Konfigurationsebenen (in der Reihenfolge der Priorität)

1. Befehlszeilenargumente
2. Umgebungsvariablen
3. Projekteinstellungsdatei (`.qwen/settings.json`)
4. Benutzereinstellungsdatei (`~/.qwen/settings.json`)
5. Systemeinstellungsdateien
6. Standardwerte

### Wichtige Konfigurationskategorien

- **Allgemeine Einstellungen:** Vim-Modus, bevorzugter Editor, Einstellungen für automatische Aktualisierungen
- **UI-Einstellungen:** Designanpassung, Sichtbarkeit des Banners, Fußzeilenanzeige
- **Modelleinstellungen:** Modellauswahl, Begrenzung der Sitzungsrunden, Komprimierungseinstellungen
- **Kontexteinstellungen:** Kontextdateinamen, Verzeichniseinbeziehung, Dateifilterung
- **Tool-Einstellungen:** Genehmigungsmodi, Sandboxing, Tool-Einschränkungen
- **Datenschutzeinstellungen:** Erfassung von Nutzungsstatistiken
- **Erweiterte Einstellungen:** Debug-Optionen, benutzerdefinierte Befehle zur Fehlermeldung

## Wichtige Designprinzipien

- **Modularität:** Die Trennung von CLI (Frontend) und Core (Backend) ermöglicht unabhängige Entwicklung und potenzielle zukünftige Erweiterungen (z. B. verschiedene Frontends für dasselbe Backend).
- **Erweiterbarkeit:** Das Tool-System ist so konzipiert, dass es erweiterbar ist, sodass durch benutzerdefinierte Tools oder MCP-Serverintegration neue Fähigkeiten hinzugefügt werden können.
- **Benutzererfahrung:** Das CLI konzentriert sich auf die Bereitstellung einer reichhaltigen und interaktiven Terminalerfahrung mit Funktionen wie Syntaxhervorhebung, anpassbaren Designs und intuitiven Befehlstrukturen.
- **Sicherheit:** Implementiert Genehmigungsmechanismen für potenziell gefährliche Operationen und Sandboxing-Optionen zum Schutz des Benutzersystems.
- **Flexibilität:** Unterstützt mehrere Konfigurationsmethoden und kann sich an verschiedene Arbeitsabläufe und Umgebungen anpassen.