# Fehlerbehebung

Diese Anleitung bietet Lösungen für häufige Probleme und Debugging-Tipps, einschließlich Themen wie:

- Authentifizierungs- oder Anmeldefehler
- Häufig gestellte Fragen (FAQs)
- Debugging-Tipps
- Vorhandene GitHub-Issues, die deinen ähneln, oder das Erstellen neuer Issues

## Authentifizierungs- oder Anmeldefehler

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` oder `unable to get local issuer certificate`**
  - **Ursache:** Sie befinden sich möglicherweise in einem Unternehmensnetzwerk mit einer Firewall, die SSL/TLS-Verkehr abfängt und untersucht. Dies erfordert oft, dass ein benutzerdefiniertes Root-CA-Zertifikat von Node.js vertraut wird.
  - **Lösung:** Setzen Sie die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad Ihrer Unternehmens-Root-CA-Zertifikatsdatei.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Problem: UI kann nach Authentifizierungsfehler nicht angezeigt werden**
  - **Ursache:** Wenn die Authentifizierung nach Auswahl eines Authentifizierungstyps fehlschlägt, kann die Einstellung `security.auth.selectedType` in `settings.json` gespeichert bleiben. Beim Neustart kann die CLI hängen bleiben, da sie versucht, sich mit dem fehlgeschlagenen Authentifizierungstyp zu authentifizieren, und die UI nicht anzeigt.
  - **Lösung:** Löschen Sie das Konfigurationselement `security.auth.selectedType` in Ihrer `settings.json`-Datei:
    - Öffnen Sie `~/.qwen/settings.json` (oder `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entfernen Sie das Feld `security.auth.selectedType`
    - Starten Sie die CLI neu, damit sie erneut zur Authentifizierung auffordern kann

## Häufig gestellte Fragen (FAQs)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn Sie es global über `npm` installiert haben, aktualisieren Sie es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Wenn Sie es aus dem Quellcode kompiliert haben, ziehen Sie die neuesten Änderungen aus dem Repository und bauen Sie es anschließend mit dem Befehl `npm run build` neu.

- **F: Wo werden die Qwen Code-Konfigurations- oder Einstellungsdateien gespeichert?**
  - A: Die Qwen Code-Konfiguration wird in zwei `settings.json`-Dateien gespeichert:
    1. In Ihrem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Stammverzeichnis Ihres Projekts: `./.qwen/settings.json`.

    Weitere Details finden Sie unter [Qwen Code Configuration](../configuration/settings).

- **F: Warum sehe ich keine zwischengespeicherten Token-Anzahlen in meiner Statistik-Ausgabe?**
  - A: Zwischengespeicherte Token-Informationen werden nur angezeigt, wenn zwischengespeicherte Token verwendet werden. Diese Funktion ist für Benutzer mit API-Schlüssel verfügbar (Qwen API-Schlüssel oder Google Cloud Vertex AI), aber nicht für OAuth-Benutzer (wie Google Privat-/Enterprise-Konten, z. B. Google Gmail oder Google Workspace). Dies liegt daran, dass die Qwen Code Assist API keine Erstellung von zwischengespeicherten Inhalten unterstützt. Sie können Ihre gesamte Token-Nutzung weiterhin mit dem Befehl `/stats` anzeigen.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Adresse wird bereits verwendet) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den sich der MCP-Server binden möchte.
  - **Lösung:**
    Beenden Sie entweder den anderen Prozess, der den Port verwendet, oder konfigurieren Sie den MCP-Server so, dass er einen anderen Port verwendet.

- **Fehler: Befehl nicht gefunden (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` Ihres Systems.
  - **Lösung:**
    Das Update hängt davon ab, wie Sie Qwen Code installiert haben:
    - Wenn Sie `qwen` global installiert haben, überprüfen Sie, ob sich Ihr globales `npm`-Binärverzeichnis in Ihrem `PATH` befindet. Sie können mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren.
    - Wenn Sie `qwen` aus dem Quellcode ausführen, stellen Sie sicher, dass Sie den richtigen Befehl verwenden, um es aufzurufen (z.B. `node packages/cli/dist/index.js ...`). Zum Aktualisieren ziehen Sie die neuesten Änderungen aus dem Repository und erstellen Sie anschließend mit dem Befehl `npm run build` neu.

- **Fehler: `MODULE_NOT_FOUND` oder Import-Fehler.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert oder das Projekt wurde nicht erstellt.
  - **Lösung:**
    1.  Führen Sie `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2.  Führen Sie `npm run build` aus, um das Projekt zu kompilieren.
    3.  Überprüfen Sie, ob der Build erfolgreich abgeschlossen wurde, mit `npm run start`.

- **Fehler: "Operation not permitted", "Permission denied" oder ähnlich.**
  - **Ursache:** Wenn die Sandbox aktiviert ist, kann Qwen Code versuchen, Operationen auszuführen, die durch Ihre Sandbox-Konfiguration eingeschränkt sind, wie z.B. Schreibvorgänge außerhalb des Projektverzeichnisses oder des temporären Systemverzeichnisses.
  - **Lösung:** Siehe Dokumentation [Konfiguration: Sandbox](../features/sandbox) für weitere Informationen, einschließlich der Anpassung Ihrer Sandbox-Konfiguration.

- **Qwen Code läuft nicht im interaktiven Modus in "CI"-Umgebungen**
  - **Problem:** Qwen Code wechselt nicht in den interaktiven Modus (keine Eingabeaufforderung erscheint), wenn eine Umgebungsvariable mit dem Präfix `CI_` (z.B. `CI_TOKEN`) gesetzt ist. Dies liegt daran, dass das `is-in-ci`-Paket, das vom zugrunde liegenden UI-Framework verwendet wird, diese Variablen erkennt und von einer nicht-interaktiven CI-Umgebung ausgeht.
  - **Ursache:** Das `is-in-ci`-Paket prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder einer beliebigen Umgebungsvariable mit dem Präfix `CI_`. Wenn eine dieser Variablen gefunden wird, signalisiert dies, dass die Umgebung nicht interaktiv ist, was verhindert, dass die CLI im interaktiven Modus startet.
  - **Lösung:** Wenn die mit `CI_` präfixierte Variable nicht benötigt wird, damit die CLI funktioniert, können Sie sie für den Befehl vorübergehend entfernen. z.B. `env -u CI_TOKEN qwen`

- **DEBUG-Modus funktioniert nicht aus Projekt-.env-Datei**
  - **Problem:** Das Setzen von `DEBUG=true` in der `.env`-Datei eines Projekts aktiviert den Debug-Modus nicht für die CLI.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus den `.env`-Dateien eines Projekts ausgeschlossen, um eine Störung des CLI-Verhaltens zu verhindern.
  - **Lösung:** Verwenden Sie stattdessen eine `.qwen/.env`-Datei oder konfigurieren Sie die Einstellung `advanced.excludedEnvVars` in Ihrer `settings.json`, um weniger Variablen auszuschließen.

## IDE Companion verbindet sich nicht

- Stellen Sie sicher, dass VS Code einen einzelnen Arbeitsbereichsordner geöffnet hat.
- Starten Sie das integrierte Terminal nach der Installation der Erweiterung neu, damit es Folgendes erbt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn Sie in einem Container arbeiten, überprüfen Sie, ob `host.docker.internal` aufgelöst wird. Andernfalls ordnen Sie den Host entsprechend zu.
- Installieren Sie den Companion erneut mit `/ide install` und verwenden Sie „Qwen Code: Run“ in der Befehlspalette, um zu überprüfen, ob er startet.

## Exit-Codes

Qwen Code verwendet spezifische Exit-Codes, um den Grund für das Beenden anzugeben. Dies ist besonders nützlich für Skripterstellung und Automatisierung.

| Exit-Code | Fehlerart                  | Beschreibung                                                                                        |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Ein Fehler ist während des Authentifizierungsprozesses aufgetreten.                                |
| 42        | `FatalInputError`          | Ungültige oder fehlende Eingabe wurde an die CLI übergeben. (nur nicht-interaktiver Modus)        |
| 44        | `FatalSandboxError`        | Ein Fehler ist mit der Sandbox-Umgebung aufgetreten (z.B. Docker, Podman oder Seatbelt).          |
| 52        | `FatalConfigError`         | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                       |
| 53        | `FatalTurnLimitedError`    | Die maximale Anzahl an konversationellen Runden für die Sitzung wurde erreicht. (nur nicht-interaktiver Modus) |

## Debugging-Tipps

- **CLI-Debugging:**
  - Verwenden Sie das Flag `--verbose` (falls verfügbar) mit CLI-Befehlen für detailliertere Ausgaben.
  - Überprüfen Sie die CLI-Logs, die sich oft in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Core-Debugging:**
  - Überprüfen Sie die Server-Konsolenausgabe auf Fehlermeldungen oder Stack-Traces.
  - Erhöhen Sie gegebenenfalls die Log-Ausführlichkeit, falls konfigurierbar.
  - Verwenden Sie Node.js-Debugging-Tools (z.B. `node --inspect`), wenn Sie serverseitigen Code Schritt für Schritt durchlaufen müssen.

- **Tool-Probleme:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuchen Sie, das Problem zu isolieren, indem Sie die einfachste mögliche Version des Befehls oder der Operation ausführen, die das Tool durchführt.
  - Für `run_shell_command` überprüfen Sie zunächst, ob der Befehl direkt in Ihrer Shell funktioniert.
  - Für _Dateisystem-Tools_ vergewissern Sie sich, dass die Pfade korrekt sind, und überprüfen Sie die Berechtigungen.

- **Pre-flight-Checks:**
  - Führen Sie vor dem Committen von Code immer `npm run preflight` aus. Dies kann viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern abfangen.

## Vorhandene GitHub-Issues ähnlich zu deinen oder neue Issues erstellen

Falls du auf ein Problem stößt, das hier in diesem _Troubleshooting-Guide_ nicht abgedeckt ist, solltest du den [Issue-Tracker von Qwen Code auf GitHub](https://github.com/QwenLM/qwen-code/issues) durchsuchen. Falls du kein ähnliches Issue findest, erstelle bitte ein neues GitHub-Issue mit einer detaillierten Beschreibung. Pull-Requests sind ebenfalls willkommen!