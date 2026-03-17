# Architekturübersicht von Qwen Code

Dieses Dokument bietet einen Überblick auf hoher Ebene über die Architektur von Qwen Code.

## Kernkomponenten

Qwen Code besteht hauptsächlich aus zwei Hauptpaketen sowie einer Reihe von Tools, die vom System bei der Verarbeitung von Befehlszeileneingaben eingesetzt werden können:

### 1. CLI-Paket (`packages/cli`)

**Zweck:** Dieses Paket enthält den nutzerseitigen Teil von Qwen Code, z. B. die Verarbeitung der ersten Benutzereingaben, die Darstellung der endgültigen Ausgabe sowie das Management der gesamten Benutzererfahrung.

**Wichtige Funktionen:**

- **Eingabeverarbeitung:** Verarbeitet Benutzereingaben über verschiedene Methoden, darunter direkte Texteingabe, Slash-Befehle (z. B. `/help`, `/clear`, `/model`), At-Befehle (`@file` zum Einbinden von Dateiinhalten) und Ausrufezeichen-Befehle (`!command` zur Ausführung von Shell-Befehlen).
- **Verwaltung des Verlaufs:** Speichert den Gesprächsverlauf und ermöglicht Funktionen wie die Wiederaufnahme einer Sitzung.
- **Darstellung der Ausgabe:** Formatiert und präsentiert Antworten dem Benutzer im Terminal mit Syntax-Hervorhebung und korrekter Formatierung.
- **Anpassung von Design und Benutzeroberfläche:** Unterstützt anpassbare Designs und UI-Elemente für ein individuelles Erlebnis.
- **Konfigurationseinstellungen:** Verwaltet verschiedene Konfigurationsoptionen über JSON-Einstellungsdateien, Umgebungsvariablen und Befehlszeilenargumente.

### 2. Kernpaket (`packages/core`)

**Zweck:** Dieses Paket fungiert als Backend für Qwen Code. Es empfängt Anfragen von `packages/cli`, koordiniert die Interaktion mit der konfigurierten Modell-API und verwaltet die Ausführung verfügbarer Tools.

**Wichtige Funktionen:**

- **API-Client:** Kommuniziert mit der Qwen-Modell-API, um Prompts zu senden und Antworten zu empfangen.
- **Prompt-Erstellung:** Erstellt geeignete Prompts für das Modell unter Einbeziehung des Konversationsverlaufs und der verfügbaren Tool-Definitionen.
- **Tool-Registrierung und -Ausführung:** Verwaltet die Registrierung verfügbarer Tools und führt sie basierend auf Modellanfragen aus.
- **Zustandsverwaltung:** Verwaltet Informationen zum Konversations- und Sitzungsstatus.
- **Serverseitige Konfiguration:** Verarbeitet serverseitige Konfigurationen und Einstellungen.

### 3. Tools (`packages/core/src/tools/`)

**Zweck:** Dies sind einzelne Module, die die Fähigkeiten des Qwen-Modells erweitern und es so ermöglichen, mit der lokalen Umgebung zu interagieren (z. B. Dateisystem, Shell-Befehle, Abrufen von Webinhalten).

**Interaktion:** `packages/core` ruft diese Tools basierend auf Anfragen des Qwen-Modells auf.

**Häufig verwendete Tools umfassen:**

- **Dateioperationen:** Lesen, Schreiben und Bearbeiten von Dateien  
- **Shell-Befehle:** Ausführen von Systembefehlen mit Zustimmung des Benutzers für potenziell gefährliche Operationen  
- **Suchtools:** Auffinden von Dateien und Durchsuchen von Inhalten innerhalb des Projekts  
- **Webtools:** Abrufen von Inhalten aus dem Internet  
- **MCP-Integration:** Verbindung zu Model-Context-Protocol-Servern für erweiterte Funktionen

## Interaktionsablauf

Eine typische Interaktion mit Qwen Code folgt diesem Ablauf:

1.  **Benutzereingabe:** Der Benutzer gibt eine Anfrage oder einen Befehl in das Terminal ein, das von `packages/cli` verwaltet wird.
2.  **Anfrage an den Core:** `packages/cli` sendet die Eingabe des Benutzers an `packages/core`.
3.  **Verarbeitung der Anfrage:** Das Core-Paket:
    - Erstellt eine geeignete Anfrage für die konfigurierte Modell-API, ggf. unter Einbeziehung des Konversationsverlaufs und verfügbarer Tool-Definitionen.
    - Sendet die Anfrage an die Modell-API.
4.  **Antwort der Modell-API:** Die Modell-API verarbeitet die Anfrage und gibt eine Antwort zurück. Diese Antwort kann entweder eine direkte Antwort sein oder eine Aufforderung zur Nutzung eines der verfügbaren Tools.
5.  **Tool-Ausführung (falls zutreffend):**
    - Sobald die Modell-API die Nutzung eines Tools anfordert, bereitet das Core-Paket dessen Ausführung vor.
    - Falls das angeforderte Tool das Dateisystem modifizieren oder Shell-Befehle ausführen kann, erhält der Benutzer zunächst Details zum Tool und zu seinen Argumenten und muss die Ausführung ausdrücklich bestätigen.
    - Lesezugriffe (z. B. das Lesen von Dateien) erfordern möglicherweise keine explizite Bestätigung durch den Benutzer.
    - Nach erfolgter Bestätigung – oder falls keine Bestätigung erforderlich ist – führt das Core-Paket die entsprechende Aktion innerhalb des betreffenden Tools aus; das Ergebnis wird vom Core-Paket an die Modell-API zurückgesendet.
    - Die Modell-API verarbeitet das Tool-Ergebnis und generiert eine endgültige Antwort.
6.  **Antwort an die CLI:** Das Core-Paket sendet die endgültige Antwort an das CLI-Paket zurück.
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

- **Allgemeine Einstellungen:** Vim-Modus, bevorzugter Editor, Einstellungen für automatische Updates  
- **Benutzeroberflächeneinstellungen:** Anpassung des Themes, Sichtbarkeit des Banners, Anzeige der Fußzeile  
- **Modell-Einstellungen:** Modellauswahl, Begrenzung der Gesprächsrunden pro Sitzung, Komprimierungseinstellungen  
- **Kontext-Einstellungen:** Namen von Kontextdateien, Einbeziehung von Verzeichnissen, Dateifilterung  
- **Tool-Einstellungen:** Genehmigungsmodi, Sandbox-Umgebung, Einschränkungen für Tools  
- **Datenschutzeinstellungen:** Erfassung von Nutzungsstatistiken  
- **Erweiterte Einstellungen:** Debug-Optionen, benutzerdefinierte Befehle für Fehlerberichte

## Wichtige Gestaltungsprinzipien

- **Modularität:** Die Trennung der CLI (Frontend) vom Core (Backend) ermöglicht eine unabhängige Entwicklung und potenzielle zukünftige Erweiterungen (z. B. verschiedene Frontends für dasselbe Backend).
- **Erweiterbarkeit:** Das Tool-System ist so konzipiert, dass es sich problemlos erweitern lässt – neue Funktionen können beispielsweise über benutzerdefinierte Tools oder die Integration eines MCP-Servers hinzugefügt werden.
- **Benutzererfahrung:** Die CLI legt besonderen Wert auf eine umfangreiche und interaktive Terminal-Erfahrung mit Funktionen wie Syntax-Hervorhebung, anpassbaren Themes und intuitiven Befehlsstrukturen.
- **Sicherheit:** Gefährliche Operationen unterliegen Genehmigungsmechanismen, zudem stehen Sandboxing-Optionen zur Verfügung, um das System des Benutzers zu schützen.
- **Flexibilität:** Unterstützt mehrere Konfigurationsmethoden und passt sich unterschiedlichen Workflows und Umgebungen an.