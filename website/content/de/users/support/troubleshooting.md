# Fehlerbehebung

Dieser Leitfaden bietet Lösungen für häufige Probleme und Debugging-Tipps, darunter Themen zu:

- Authentifizierungs- oder Anmeldefehlern
- Häufig gestellte Fragen (FAQs)
- Debugging-Tipps
- Vorhandene GitHub-Issues, die deinem Problem ähneln, oder das Erstellen neuer Issues

## Authentifizierungs- oder Anmeldefehler

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` oder `unable to get local issuer certificate`**
  - **Ursache:** Sie befinden sich möglicherweise in einem Unternehmensnetzwerk mit einer Firewall, die SSL/TLS-Datenverkehr abfängt und überprüft. Dies erfordert oft ein benutzerdefiniertes Stammzertifikat, das von Node.js als vertrauenswürdig eingestuft wird.
  - **Lösung:** Legen Sie die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad Ihrer Unternehmens-Stammzertifikatsdatei fest.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/pfad/zu/Ihrer/corporate-ca.crt`

- **Problem: Die Benutzeroberfläche kann nach einem Authentifizierungsfehler nicht angezeigt werden**
  - **Ursache:** Wenn die Authentifizierung nach der Auswahl eines Authentifizierungstyps fehlschlägt, wird die Einstellung `security.auth.selectedType` möglicherweise in der Datei `settings.json` gespeichert. Beim Neustart kann die CLI dann beim Versuch stecken bleiben, sich mit dem fehlgeschlagenen Authentifizierungstyp anzumelden, und die Benutzeroberfläche nicht anzeigen.
  - **Lösung:** Löschen Sie den Konfigurationseintrag `security.auth.selectedType` in Ihrer Datei `settings.json`:
    - Öffnen Sie `~/.qwen/settings.json` (oder `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entfernen Sie das Feld `security.auth.selectedType`
    - Starten Sie die CLI neu, damit sie erneut zur Authentifizierung auffordern kann

## Häufig gestellte Fragen (FAQs)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn du es global über `npm` installiert hast, aktualisiere es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Wenn du es aus dem Quellcode kompiliert hast, ziehe die neuesten Änderungen aus dem Repository und führe dann den Befehl `npm run build` aus, um es neu zu erstellen.

- **F: Wo werden die Qwen Code-Konfigurations- oder Einstellungsdateien gespeichert?**
  - A: Die Qwen Code-Konfiguration wird in zwei `settings.json`-Dateien gespeichert:
    1. In deinem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Stammverzeichnis deines Projekts: `./.qwen/settings.json`.

    Weitere Informationen findest du unter [Qwen Code-Konfiguration](/users/configuration/settings).

- **F: Warum sehe ich keine zwischengespeicherten Token-Zähler in meiner Statistik-Ausgabe?**
  - A: Informationen zu zwischengespeicherten Tokens werden nur angezeigt, wenn zwischengespeicherte Tokens verwendet werden. Diese Funktion ist für API-Schlüssel-Benutzer (Qwen API-Schlüssel oder Google Cloud Vertex AI) verfügbar, aber nicht für OAuth-Benutzer (wie z. B. persönliche/Unternehmens-Google-Konten wie Google Gmail oder Google Workspace). Der Grund dafür ist, dass die Qwen Code Assist-API das Erstellen von zwischengespeicherten Inhalten nicht unterstützt. Du kannst deine gesamte Token-Nutzung weiterhin mit dem Befehl `/stats` anzeigen.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Adresse bereits in Verwendung) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den der MCP-Server gebunden werden soll.
  - **Lösung:**
    Beenden Sie entweder den anderen Prozess, der den Port verwendet, oder konfigurieren Sie den MCP-Server so, dass er einen anderen Port verwendet.

- **Fehler: Befehl nicht gefunden (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` Ihres Systems.
  - **Lösung:**
    Das Update hängt davon ab, wie Sie Qwen Code installiert haben:
    - Wenn Sie `qwen` global installiert haben, stellen Sie sicher, dass das globale Binärverzeichnis von `npm` in Ihrem `PATH` enthalten ist. Sie können ein Update mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` durchführen.
    - Wenn Sie `qwen` aus dem Quellcode ausführen, stellen Sie sicher, dass Sie den richtigen Befehl zur Ausführung verwenden (z. B. `node packages/cli/dist/index.js ...`). Um ein Update durchzuführen, ziehen Sie die neuesten Änderungen aus dem Repository und führen Sie anschließend den Befehl `npm run build` aus.

- **Fehler: `MODULE_NOT_FOUND` oder Importfehler.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert oder das Projekt wurde nicht erstellt.
  - **Lösung:**
    1. Führen Sie `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2. Führen Sie `npm run build` aus, um das Projekt zu kompilieren.
    3. Vergewissern Sie sich mit `npm run start`, dass der Build erfolgreich abgeschlossen wurde.

- **Fehler: „Operation not permitted“, „Permission denied“ oder ähnliche Meldungen.**
  - **Ursache:** Wenn Sandboxing aktiviert ist, kann Qwen Code versuchen, Vorgänge auszuführen, die durch Ihre Sandbox-Konfiguration eingeschränkt sind, z. B. Schreibvorgänge außerhalb des Projektverzeichnisses oder des temporären Systemverzeichnisses.
  - **Lösung:** Weitere Informationen finden Sie in der Dokumentation unter [Konfiguration: Sandboxing](/users/features/sandbox), einschließlich Anweisungen zum Anpassen Ihrer Sandbox-Konfiguration.

- **Qwen Code wird in „CI“-Umgebungen nicht im interaktiven Modus ausgeführt**
  - **Problem:** Qwen Code wechselt nicht in den interaktiven Modus (es erscheint keine Eingabeaufforderung), wenn eine Umgebungsvariable mit dem Präfix `CI_` (z. B. `CI_TOKEN`) gesetzt ist. Der Grund dafür ist, dass das Paket `is-in-ci`, das vom zugrunde liegenden UI-Framework verwendet wird, diese Variablen erkennt und annimmt, dass es sich um eine nicht-interaktive CI-Umgebung handelt.
  - **Ursache:** Das Paket `is-in-ci` prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder einer beliebigen Umgebungsvariable mit dem Präfix `CI_`. Wird eine dieser Variablen gefunden, signalisiert dies, dass die Umgebung nicht interaktiv ist, wodurch verhindert wird, dass die CLI im interaktiven Modus gestartet wird.
  - **Lösung:** Falls die Variable mit dem Präfix `CI_` für die Funktionsweise der CLI nicht erforderlich ist, können Sie sie vorübergehend für den Befehl deaktivieren, z. B. mit `env -u CI_TOKEN qwen`.

- **DEBUG-Modus funktioniert nicht über die .env-Datei des Projekts**
  - **Problem:** Das Setzen von `DEBUG=true` in der `.env`-Datei eines Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus den `.env`-Projektdateien ausgeschlossen, um Störungen des CLI-Verhaltens zu vermeiden.
  - **Lösung:** Verwenden Sie stattdessen eine `.qwen/.env`-Datei oder passen Sie die Einstellung `advanced.excludedEnvVars` in Ihrer `settings.json` an, um weniger Variablen auszuschließen.

## IDE Companion verbindet nicht

- Stellen Sie sicher, dass VS Code einen einzelnen Arbeitsbereichsordner geöffnet hat.
- Starten Sie das integrierte Terminal nach der Installation der Erweiterung neu, damit es die folgenden Umgebungsvariablen erbt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn Sie in einem Container arbeiten, überprüfen Sie, ob `host.docker.internal` aufgelöst wird. Andernfalls ordnen Sie den Host entsprechend zu.
- Installieren Sie den Companion mit `/ide install` neu und verwenden Sie „Qwen Code: Run“ in der Befehlspalette, um zu überprüfen, ob er startet.

## Exit Codes

Qwen Code verwendet spezifische Exit-Codes, um den Grund für die Beendigung anzugeben. Dies ist besonders nützlich für Skripting und Automatisierung.

| Exit Code | Fehlertyp                  | Beschreibung                                                 |
| --------- | -------------------------- | ------------------------------------------------------------ |
| 41        | `FatalAuthenticationError` | Ein Fehler ist während des Authentifizierungsprozesses aufgetreten. |
| 42        | `FatalInputError`          | Ungültige oder fehlende Eingabe wurde an die CLI übergeben. (nur im nicht-interaktiven Modus) |
| 44        | `FatalSandboxError`        | Ein Fehler ist mit der Sandbox-Umgebung aufgetreten (z. B. Docker, Podman oder Seatbelt). |
| 52        | `FatalConfigError`         | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler. |
| 53        | `FatalTurnLimitedError`    | Die maximale Anzahl an Gesprächsrunden für die Sitzung wurde erreicht. (nur im nicht-interaktiven Modus) |

## Debugging-Tipps

- **CLI-Debugging:**
  - Verwende das `--verbose`-Flag (falls verfügbar) mit CLI-Befehlen, um detailliertere Ausgaben zu erhalten.
  - Prüfe die CLI-Logs, die sich oft in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Core-Debugging:**
  - Prüfe die Server-Konsolenausgabe auf Fehlermeldungen oder Stack-Traces.
  - Erhöhe die Log-Ausführlichkeit, falls konfigurierbar.
  - Verwende Node.js-Debugging-Tools (z. B. `node --inspect`), wenn du serverseitigen Code schrittweise durchgehen musst.

- **Tool-Probleme:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuche das Problem zu isolieren, indem du die einfachste mögliche Version des Befehls oder der Operation ausführst, die das Tool durchführt.
  - Für `run_shell_command` prüfe zunächst, ob der Befehl direkt in deiner Shell funktioniert.
  - Für _Dateisystem-Tools_ stelle sicher, dass die Pfade korrekt sind und überprüfe die Berechtigungen.

- **Pre-Flight-Checks:**
  - Führe immer `npm run preflight` vor dem Committen von Code aus. Dies kann viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern abfangen.

## Vorhandene GitHub-Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

Falls du auf ein Problem stößt, das in diesem _Leitfaden zur Fehlerbehebung_ nicht behandelt wird, solltest du den Qwen Code [Issue-Tracker auf GitHub](https://github.com/QwenLM/qwen-code/issues) durchsuchen. Wenn du kein Issue findest, das deinem ähnelt, erstelle bitte ein neues GitHub-Issue mit einer detaillierten Beschreibung. Pull Requests sind ebenfalls willkommen!