# Problembehandlung

Dieser Leitfaden enthält Lösungen für häufig auftretende Probleme sowie Tipps zur Fehlersuche, darunter folgende Themen:

- Authentifizierungs- oder Anmeldefehler
- Häufig gestellte Fragen (FAQ)
- Tipps zur Fehlersuche
- Vorhandene GitHub-Probleme, die Ihrem Problem ähneln, oder das Erstellen neuer Probleme

## Authentifizierungs- oder Anmeldefehler

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` oder `unable to get local issuer certificate`**
  - **Ursache:** Möglicherweise befinden Sie sich in einem Unternehmensnetzwerk mit einer Firewall, die den SSL/TLS-Verkehr abfängt und überprüft. Dies erfordert häufig, dass ein benutzerdefiniertes Stamm-CA-Zertifikat von Node.js als vertrauenswürdig eingestuft wird.
  - **Lösung:** Legen Sie die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad Ihrer Unternehmens-Stamm-CA-Zertifikatsdatei fest.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/pfad/zu/ihrem/unternehmens-ca.crt`

- **Fehler: `Device authorization flow failed: fetch failed`**
  - **Ursache:** Node.js konnte keine Verbindung zu den Qwen-OAuth-Endpunkten herstellen (häufig ein Proxy- oder SSL/TLS-Vertrauensproblem). Falls verfügbar, gibt Qwen Code außerdem die zugrundeliegende Fehlerursache aus (z. B. `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - **Lösung:**
    - Stellen Sie sicher, dass Sie von derselben Maschine bzw. demselben Netzwerk aus auf `https://chat.qwen.ai` zugreifen können.
    - Falls Sie sich hinter einem Proxy befinden, konfigurieren Sie diesen über `qwen --proxy <url>` (oder über die Einstellung `proxy` in `settings.json`).
    - Falls Ihr Netzwerk eine Unternehmens-TLS-Inspektions-CA verwendet, setzen Sie `NODE_EXTRA_CA_CERTS` wie oben beschrieben.

- **Problem: UI lässt sich nach einem Authentifizierungsfehler nicht anzeigen**
  - **Ursache:** Wenn die Authentifizierung nach der Auswahl einer Authentifizierungsmethode fehlschlägt, wird möglicherweise die Einstellung `security.auth.selectedType` in `settings.json` gespeichert. Beim Neustart versucht die CLI dann erneut, sich mit der fehlgeschlagenen Methode zu authentifizieren, bleibt hängen und zeigt die Benutzeroberfläche nicht an.
  - **Lösung:** Löschen Sie den Konfigurationseintrag `security.auth.selectedType` aus Ihrer Datei `settings.json`:
    - Öffnen Sie `~/.qwen/settings.json` (bzw. `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entfernen Sie das Feld `security.auth.selectedType`
    - Starten Sie die CLI neu, damit sie erneut zur Authentifizierung auffordern kann

## Häufig gestellte Fragen (FAQ)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Falls Sie Qwen Code global über `npm` installiert haben, aktualisieren Sie es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Falls Sie es aus dem Quellcode kompiliert haben, ziehen Sie die neuesten Änderungen aus dem Repository und erstellen Sie es anschließend neu mit dem Befehl `npm run build`.

- **F: Wo werden die Konfigurations- oder Einstellungsdateien von Qwen Code gespeichert?**
  - A: Die Qwen-Code-Konfiguration wird in zwei Dateien namens `settings.json` gespeichert:
    1. Im Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Stammverzeichnis Ihres Projekts: `./.qwen/settings.json`.

    Weitere Details finden Sie unter [Qwen Code-Konfiguration](../configuration/settings).

- **F: Warum werden zwischengespeicherte Tokenzahlen in meiner Statistik-Ausgabe nicht angezeigt?**
  - A: Zwischengespeicherte Tokeninformationen werden nur angezeigt, wenn tatsächlich zwischengespeicherte Tokens verwendet werden. Diese Funktion steht Nutzern mit API-Schlüsseln (Qwen-API-Schlüssel oder Google Cloud Vertex AI) zur Verfügung, jedoch nicht Nutzern mit OAuth-Anmeldung (z. B. Google-Personal- oder Google-Enterprise-Konten wie Google Gmail bzw. Google Workspace). Der Grund hierfür ist, dass die Qwen Code Assist-API keine Erstellung zwischengespeicherter Inhalte unterstützt. Sie können Ihre gesamte Token-Nutzung dennoch über den Befehl `/stats` einsehen.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Adresse bereits in Verwendung) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den sich der MCP-Server binden möchte.
  - **Lösung:**
    Beenden Sie entweder den anderen Prozess, der den Port belegt, oder konfigurieren Sie den MCP-Server so, dass er einen anderen Port verwendet.

- **Fehler: Befehl nicht gefunden (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` Ihres Systems.
  - **Lösung:**
    Das Update hängt davon ab, wie Sie Qwen Code installiert haben:
    - Falls Sie `qwen` global installiert haben, stellen Sie sicher, dass das globale Binärverzeichnis von `npm` im `PATH` enthalten ist. Aktualisieren Sie mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`.
    - Falls Sie `qwen` aus dem Quellcode ausführen, stellen Sie sicher, dass Sie den richtigen Befehl zur Ausführung verwenden (z. B. `node packages/cli/dist/index.js ...`). Um zu aktualisieren, ziehen Sie die neuesten Änderungen aus dem Repository und erstellen Sie das Projekt neu mit dem Befehl `npm run build`.

- **Fehler: `MODULE_NOT_FOUND` oder Importfehler.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert oder das Projekt wurde noch nicht gebaut.
  - **Lösung:**
    1.  Führen Sie `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2.  Führen Sie `npm run build` aus, um das Projekt zu kompilieren.
    3.  Überprüfen Sie mit `npm run start`, ob der Build erfolgreich abgeschlossen wurde.

- **Fehler: „Operation not permitted“, „Permission denied“ oder ähnlich.**
  - **Ursache:** Wenn die Sandbox-Funktion aktiviert ist, versucht Qwen Code möglicherweise Operationen, die durch Ihre Sandbox-Konfiguration eingeschränkt sind – z. B. das Schreiben außerhalb des Projektverzeichnisses oder des temporären Systemverzeichnisses.
  - **Lösung:** Weitere Informationen, einschließlich Anleitungen zur Anpassung Ihrer Sandbox-Konfiguration, finden Sie in der Dokumentation unter [Konfiguration: Sandboxing](../features/sandbox).

- **Qwen Code wird in „CI“-Umgebungen nicht im interaktiven Modus ausgeführt**
  - **Problem:** Qwen Code wechselt nicht in den interaktiven Modus (keine Eingabeaufforderung erscheint), wenn eine Umgebungsvariable mit dem Präfix `CI_` (z. B. `CI_TOKEN`) gesetzt ist. Dies liegt daran, dass das Paket `is-in-ci`, das vom zugrundeliegenden UI-Framework verwendet wird, solche Variablen erkennt und annimmt, dass es sich um eine nicht-interaktive CI-Umgebung handelt.
  - **Ursache:** Das Paket `is-in-ci` prüft auf das Vorhandensein der Variablen `CI`, `CONTINUOUS_INTEGRATION` oder einer beliebigen Umgebungsvariablen mit dem Präfix `CI_`. Wird eine dieser Variablen gefunden, wird angenommen, dass die Umgebung nicht interaktiv ist, wodurch der CLI-Start im interaktiven Modus verhindert wird.
  - **Lösung:** Falls die Umgebungsvariable mit dem Präfix `CI_` für die Funktionsfähigkeit der CLI nicht erforderlich ist, können Sie sie vorübergehend für diesen Befehl deaktivieren, z. B. mit `env -u CI_TOKEN qwen`.

- **DEBUG-Modus funktioniert nicht über die Projekt-`.env`-Datei**
  - **Problem:** Die Festlegung von `DEBUG=true` in der `.env`-Datei eines Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus Projekt-`.env`-Dateien ausgeschlossen, um Interferenzen mit dem Verhalten der CLI zu vermeiden.
  - **Lösung:** Verwenden Sie stattdessen eine `.qwen/.env`-Datei oder passen Sie die Einstellung `advanced.excludedEnvVars` in Ihrer `settings.json` so an, dass weniger Variablen ausgeschlossen werden.

## IDE-Companion verbindet nicht

- Stellen Sie sicher, dass in VS Code genau ein Arbeitsbereichsordner geöffnet ist.
- Starten Sie das integrierte Terminal nach der Installation der Erweiterung neu, damit es folgende Umgebungsvariablen übernimmt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Falls die Anwendung in einem Container ausgeführt wird, prüfen Sie, ob `host.docker.internal` auflösbar ist. Andernfalls müssen Sie den Host entsprechend mappen.
- Installieren Sie den Companion erneut mit `/ide install` und verwenden Sie „Qwen Code: Run“ in der Befehlspalette, um zu überprüfen, ob er gestartet wird.

## Exit-Codes

Qwen Code verwendet spezifische Exit-Codes, um den Grund für das Beenden des Programms anzugeben. Dies ist insbesondere bei Skripten und Automatisierung hilfreich.

| Exit-Code | Fehlerart                     | Beschreibung                                                                                         |
| --------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError`    | Während des Authentifizierungsprozesses ist ein Fehler aufgetreten.                                 |
| 42        | `FatalInputError`             | Es wurden ungültige oder fehlende Eingaben an die CLI übergeben. (Nur im nicht-interaktiven Modus)   |
| 44        | `FatalSandboxError`           | Ein Fehler ist in der Sandbox-Umgebung aufgetreten (z. B. Docker, Podman oder Seatbelt).            |
| 52        | `FatalConfigError`            | Die Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                          |
| 53        | `FatalTurnLimitedError`       | Die maximale Anzahl an Gesprächswechseln für die Sitzung wurde erreicht. (Nur im nicht-interaktiven Modus) |

## Tipps zur Fehlerbehebung

- **Fehlerbehebung über die CLI:**
  - Verwenden Sie das Flag `--verbose` (sofern verfügbar) mit CLI-Befehlen, um detailliertere Ausgaben zu erhalten.
  - Überprüfen Sie die CLI-Protokolle, die sich häufig in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Fehlerbehebung im Kern:**
  - Prüfen Sie die Server-Konsole auf Fehlermeldungen oder Stack-Traces.
  - Erhöhen Sie die Protokollausführlichkeit, falls dies konfigurierbar ist.
  - Nutzen Sie Node.js-Debugging-Tools (z. B. `node --inspect`), wenn Sie den serverseitigen Code schrittweise durchlaufen müssen.

- **Probleme mit Tools:**
  - Falls ein bestimmtes Tool fehlschlägt, versuchen Sie, das Problem einzugrenzen, indem Sie die einfachste mögliche Version des Befehls oder der Operation ausführen, die das Tool durchführt.
  - Bei `run_shell_command` prüfen Sie zunächst, ob der Befehl direkt in Ihrer Shell funktioniert.
  - Bei _Dateisystem-Tools_ überprüfen Sie, ob die Pfade korrekt sind, und stellen Sie sicher, dass die erforderlichen Berechtigungen vorliegen.

- **Vorab-Prüfungen (Pre-flight checks):**
  - Führen Sie stets `npm run preflight` aus, bevor Sie Code committen. Dadurch werden viele gängige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern erkannt.

## Vorhandene GitHub-Issues, die Ihrem Problem ähneln, oder neue Issues erstellen

Falls Sie ein Problem feststellen, das hier in dieser _Anleitung zur Fehlerbehebung_ nicht behandelt wird, suchen Sie bitte im [Issue-Tracker von Qwen Code auf GitHub](https://github.com/QwenLM/qwen-code/issues). Falls Sie kein Issue finden, das Ihrem Problem ähnelt, erstellen Sie bitte ein neues GitHub-Issue mit einer detaillierten Beschreibung. Pull Requests sind ebenfalls willkommen!