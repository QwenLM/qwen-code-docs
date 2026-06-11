# Architekturübersicht von Qwen Code

Dieses Dokument bietet eine allgemeine Übersicht über die Architektur von Qwen Code.

## Kernkomponenten

Qwen Code besteht hauptsächlich aus zwei zentralen Paketen sowie einer Reihe von Tools, die das System bei der Verarbeitung von Befehlszeileneingaben nutzen kann:

### 1. CLI-Paket (`packages/cli`)

**Zweck:** Dieses Paket enthält die nutzerorientierte Komponente von Qwen Code. Dazu gehören die Verarbeitung der ersten Nutzereingaben, die Darstellung der finalen Ausgabe und das Management der gesamten User Experience.

**Wichtige Funktionen:**

- **Eingabeverarbeitung:** Verarbeitet Nutzereingaben über verschiedene Methoden, darunter direkte Texteingabe, Slash-Commands (z. B. `/help`, `/clear`, `/model`), At-Commands (`@file` zum Einbinden von Dateiinhalten) und Ausrufezeichen-Commands (`!command` zur Shell-Ausführung).
- **Verlaufverwaltung:** Speichert den Konversationsverlauf und ermöglicht Funktionen wie das Fortsetzen von Sitzungen.
- **Darstellung:** Formatiert und zeigt Antworten im Terminal mit Syntax-Highlighting und korrekter Formatierung an.
- **Theme- und UI-Anpassung:** Unterstützt anpassbare Themes und UI-Elemente für eine personalisierte Erfahrung.
- **Konfigurationseinstellungen:** Verwaltet verschiedene Konfigurationsoptionen über JSON-Einstellungsdateien, Umgebungsvariablen und Befehlszeilenargumente.

### 2. Core-Paket (`packages/core`)

**Zweck:** Dieses Paket fungiert als Backend für Qwen Code. Es empfängt Anfragen von `packages/cli`, orchestriert die Interaktion mit der konfigurierten Model-API und verwaltet die Ausführung der verfügbaren Tools.

**Wichtige Funktionen:**

- **API-Client:** Kommuniziert mit der Qwen Model-API, um Prompts zu senden und Antworten zu empfangen.
- **Prompt-Erstellung:** Erstellt passende Prompts für das Modell, indem Konversationsverlauf und verfügbare Tool-Definitionen einbezogen werden.
- **Tool-Registrierung und -Ausführung:** Verwaltet die Registrierung verfügbarer Tools und führt sie basierend auf Modellanfragen aus.
- **Zustandsverwaltung:** Speichert Informationen zum Konversations- und Sitzungszustand.
- **Serverseitige Konfiguration:** Verwaltet serverseitige Konfigurationen und Einstellungen.

### 3. Tools (`packages/core/src/tools/`)

**Zweck:** Dies sind einzelne Module, die die Fähigkeiten des Qwen-Modells erweitern und ihm die Interaktion mit der lokalen Umgebung ermöglichen (z. B. Dateisystem, Shell-Befehle, Web-Abruf).

**Interaktion:** `packages/core` ruft diese Tools basierend auf Anfragen des Qwen-Modells auf.

**Häufig genutzte Tools umfassen:**

- **Dateioperationen:** Lesen, Schreiben und Bearbeiten von Dateien
- **Shell-Befehle:** Ausführen von Systembefehlen mit Nutzerbestätigung für potenziell gefährliche Operationen
- **Such-Tools:** Finden von Dateien und Durchsuchen von Inhalten im Projekt
- **Web-Tools:** Abrufen von Inhalten aus dem Web
- **MCP-Integration:** Verbindung zu Model Context Protocol Servern für erweiterte Funktionen

## Interaktionsablauf

Eine typische Interaktion mit Qwen Code folgt diesem Ablauf:

1.  **Nutzereingabe:** Der Nutzer gibt einen Prompt oder Befehl ins Terminal ein, was von `packages/cli` verwaltet wird.
2.  **Anfrage an Core:** `packages/cli` sendet die Nutzereingabe an `packages/core`.
3.  **Anfrageverarbeitung:** Das Core-Paket:
    - Erstellt einen passenden Prompt für die konfigurierte Model-API, der ggf. den Konversationsverlauf und verfügbare Tool-Definitionen enthält.
    - Sendet den Prompt an die Model-API.
4.  **Model-API-Antwort:** Die Model-API verarbeitet den Prompt und gibt eine Antwort zurück. Diese kann eine direkte Antwort oder eine Anfrage zur Nutzung eines der verfügbaren Tools sein.
5.  **Tool-Ausführung (falls zutreffend):**
    - Wenn die Model-API ein Tool anfordert, bereitet das Core-Paket die Ausführung vor.
    - Wenn das angeforderte Tool das Dateisystem ändern oder Shell-Befehle ausführen kann, erhält der Nutzer zunächst Details zum Tool und seinen Argumenten und muss die Ausführung bestätigen.
    - Schreibgeschützte Operationen wie das Lesen von Dateien erfordern möglicherweise keine explizite Nutzerbestätigung.
    - Nach der Bestätigung oder falls keine Bestätigung erforderlich ist, führt das Core-Paket die entsprechende Aktion im jeweiligen Tool aus und sendet das Ergebnis zurück an die Model-API.
    - Die Model-API verarbeitet das Tool-Ergebnis und generiert eine finale Antwort.
6.  **Antwort an CLI:** Das Core-Paket sendet die finale Antwort zurück an das CLI-Paket.
7.  **Anzeige für den Nutzer:** Das CLI-Paket formatiert die Antwort und zeigt sie dem Nutzer im Terminal an.

## Konfigurationsoptionen

Qwen Code bietet mehrere Möglichkeiten, sein Verhalten zu konfigurieren:

### Konfigurationsebenen (in absteigender Priorität)

1. Befehlszeilenargumente
2. Umgebungsvariablen
3. Projekt-Einstellungsdatei (`.qwen/settings.json`)
4. Nutzer-Einstellungsdatei (`~/.qwen/settings.json`)
5. System-Einstellungsdateien
6. Standardwerte

### Wichtige Konfigurationskategorien

- **Allgemeine Einstellungen:** Vim-Modus, bevorzugter Editor, Auto-Update-Einstellungen
- **UI-Einstellungen:** Theme-Anpassung, Banner-Sichtbarkeit, Footer-Anzeige
- **Model-Einstellungen:** Modellauswahl, Turn-Limits pro Sitzung, Komprimierungseinstellungen
- **Kontext-Einstellungen:** Kontextdateinamen, Verzeichniseinbindung, Dateifilterung
- **Tool-Einstellungen:** Bestätigungsmodi, Sandboxing, Tool-Einschränkungen
- **Datenschutzeinstellungen:** Erfassung von Nutzungsstatistiken
- **Erweiterte Einstellungen:** Debug-Optionen, benutzerdefinierte Befehle zur Fehlermeldung

## Wichtige Designprinzipien

- **Modularität:** Die Trennung von CLI (Frontend) und Core (Backend) ermöglicht eine unabhängige Entwicklung und potenzielle zukünftige Erweiterungen (z. B. verschiedene Frontends für dasselbe Backend).
- **Erweiterbarkeit:** Das Tool-System ist darauf ausgelegt, erweiterbar zu sein, sodass neue Funktionen durch benutzerdefinierte Tools oder MCP-Server-Integration hinzugefügt werden können.
- **User Experience:** Das CLI konzentriert sich auf eine umfangreiche und interaktive Terminal-Erfahrung mit Funktionen wie Syntax-Highlighting, anpassbaren Themes und intuitiven Befehlsstrukturen.
- **Sicherheit:** Implementiert Bestätigungsmechanismen für potenziell gefährliche Operationen sowie Sandboxing-Optionen zum Schutz des Nutzersystems.
- **Flexibilität:** Unterstützt mehrere Konfigurationsmethoden und kann sich an verschiedene Workflows und Umgebungen anpassen.