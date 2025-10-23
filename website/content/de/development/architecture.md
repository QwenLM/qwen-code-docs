# Qwen Code Architektur-Überblick

Dieses Dokument bietet einen hochrangigen Überblick über die Architektur von Qwen Code.

## Core-Komponenten

Qwen Code besteht hauptsächlich aus zwei Hauptpaketen sowie einer Sammlung von Tools, die vom System während der Verarbeitung von Befehlszeileneingaben verwendet werden können:

1.  **CLI-Paket (`packages/cli`):**
    - **Zweck:** Enthält den benutzerseitigen Teil von Qwen Code, wie z. B. die Verarbeitung der ursprünglichen Benutzereingabe, die Darstellung der finalen Ausgabe und das Management der gesamten Benutzererfahrung.
    - **Wichtige Funktionen des Pakets:**
      - [Eingabeverarbeitung](./cli/commands.md)
      - Verwaltung des Verlaufs
      - Rendern der Anzeige
      - [Theme- und UI-Anpassung](./cli/themes.md)
      - [CLI-Konfigurationseinstellungen](./cli/configuration.md)

2.  **Core-Paket (`packages/core`):**
    - **Zweck:** Stellt das Backend für Qwen Code dar. Es empfängt Anfragen vom `packages/cli`, koordiniert die Interaktion mit der konfigurierten Modell-API und verwaltet die Ausführung verfügbarer Tools.
    - **Wichtige Funktionen des Pakets:**
      - API-Client zur Kommunikation mit der Google Gemini API
      - Aufbau und Verwaltung von Prompts
      - Logik zur Registrierung und Ausführung von Tools
      - Zustandsverwaltung für Konversationen oder Sessions
      - serverseitige Konfiguration

3.  **Tools (`packages/core/src/tools/`):**
    - **Zweck:** Eigenständige Module, welche die Fähigkeiten des Gemini-Modells erweitern und ihm ermöglichen, mit der lokalen Umgebung zu interagieren (z. B. Dateisystem, Shell-Befehle, Webanfragen).
    - **Interaktion:** `packages/core` ruft diese Tools basierend auf Anfragen des Gemini-Modells auf.

## Interaktionsablauf

Eine typische Interaktion mit Qwen Code folgt diesem Ablauf:

1.  **Benutzereingabe:** Der Benutzer gibt einen Prompt oder Befehl im Terminal ein, der von `packages/cli` verwaltet wird.
2.  **Anfrage an den Core:** `packages/cli` sendet die Eingabe des Benutzers an `packages/core`.
3.  **Verarbeitung der Anfrage:** Das Core-Paket:
    - Erstellt einen geeigneten Prompt für die konfigurierte Model-API, ggf. inklusive Konversationsverlauf und verfügbaren Tool-Definitionen.
    - Sendet den Prompt an die Model-API.
4.  **Antwort der Model-API:** Die Model-API verarbeitet den Prompt und gibt eine Antwort zurück. Diese Antwort kann eine direkte Antwort sein oder eine Anforderung zur Nutzung eines der verfügbaren Tools.
5.  **Ausführung des Tools (falls zutreffend):**
    - Wenn die Model-API ein Tool anfordert, bereitet das Core-Paket dessen Ausführung vor.
    - Falls das angeforderte Tool Dateisystem ändern oder Shell-Befehle ausführen kann, zeigt das System dem Benutzer zunächst Details zum Tool und dessen Argumente an, und der Benutzer muss die Ausführung bestätigen.
    - Reine Leseoperationen wie das Lesen von Dateien erfordern möglicherweise keine explizite Bestätigung durch den Benutzer.
    - Nach Bestätigung oder falls keine Bestätigung erforderlich ist, führt das Core-Paket die entsprechende Aktion innerhalb des jeweiligen Tools aus, und das Ergebnis wird vom Core-Paket an die Model-API zurückgesendet.
    - Die Model-API verarbeitet das Tool-Ergebnis und generiert eine finale Antwort.
6.  **Rückmeldung an die CLI:** Das Core-Paket sendet die finale Antwort zurück an das CLI-Paket.
7.  **Anzeige für den Benutzer:** Das CLI-Paket formatiert die Antwort und zeigt sie dem Benutzer im Terminal an.

## Wichtige Design-Prinzipien

- **Modularität:** Die Trennung der CLI (Frontend) vom Core (Backend) ermöglicht eine unabhängige Entwicklung und potenzielle zukünftige Erweiterungen (z. B. verschiedene Frontends für dasselbe Backend).
- **Erweiterbarkeit:** Das Tool-System ist so konzipiert, dass es erweiterbar ist und neue Funktionen hinzugefügt werden können.
- **Benutzererfahrung:** Die CLI konzentriert sich darauf, eine umfangreiche und interaktive Terminal-Erfahrung zu bieten.