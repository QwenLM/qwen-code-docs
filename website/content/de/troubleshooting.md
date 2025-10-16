# Leitfaden zur Fehlerbehebung

Dieser Leitfaden bietet Lösungen für häufige Probleme und Debugging-Tipps, darunter Themen zu:

- Authentifizierungs- oder Login-Fehlern
- Häufig gestellte Fragen (FAQs)
- Debugging-Tipps
- Vorhandene GitHub Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

## Authentifizierungs- oder Login-Fehler

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` oder `unable to get local issuer certificate`**
  - **Ursache:** Du befindest dich möglicherweise in einem Unternehmensnetzwerk mit einer Firewall, die SSL/TLS-Datenverkehr abfängt und untersucht. Dies erfordert oft ein benutzerdefiniertes Root-CA-Zertifikat, das von Node.js vertraut werden muss.
  - **Lösung:** Setze die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad deiner Unternehmens-Root-CA-Zertifikatsdatei.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

## Häufig gestellte Fragen (FAQs)

- **Q: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn du es global über `npm` installiert hast, kannst du es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren. Wenn du es aus dem Quellcode kompiliert hast, ziehe die neuesten Änderungen aus dem Repository und führe dann den Befehl `npm run build` aus, um es neu zu erstellen.

- **Q: Wo werden die Qwen Code Konfigurations- oder Einstellungsdateien gespeichert?**
  - A: Die Qwen Code Konfiguration wird in zwei `settings.json` Dateien gespeichert:
    1. In deinem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Root-Verzeichnis deines Projekts: `./.qwen/settings.json`.

    Weitere Informationen findest du unter [Qwen Code Konfiguration](./cli/configuration.md).

- **Q: Warum sehe ich keine zwischengespeicherten Token-Zähler in meiner Statistik-Ausgabe?**
  - A: Informationen zu zwischengespeicherten Tokens werden nur angezeigt, wenn solche Tokens tatsächlich verwendet werden. Dieses Feature steht Nutzern mit API-Schlüssel (Qwen API key oder Google Cloud Vertex AI) zur Verfügung, jedoch nicht für OAuth-Nutzer (wie z. B. persönliche oder Enterprise-Google-Konten wie Google Gmail oder Google Workspace). Grund dafür ist, dass die Qwen Code Assist API das Erstellen von zwischengespeicherten Inhalten nicht unterstützt. Du kannst deine gesamte Token-Nutzung weiterhin mit dem Befehl `/stats` einsehen.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Adresse bereits in Verwendung) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, den der MCP-Server binden möchte.
  - **Lösung:**
    Beende entweder den anderen Prozess, der den Port verwendet, oder konfiguriere den MCP-Server so, dass er einen anderen Port verwendet.

- **Fehler: Befehl nicht gefunden (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` deines Systems.
  - **Lösung:**
    Das Update hängt davon ab, wie du Qwen Code installiert hast:
    - Wenn du `qwen` global installiert hast, stelle sicher, dass dein globales `npm`-Binary-Verzeichnis im `PATH` enthalten ist. Du kannst mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren.
    - Wenn du `qwen` aus dem Quellcode ausführst, stelle sicher, dass du den richtigen Befehl zum Aufruf verwendest (z. B. `node packages/cli/dist/index.js ...`). Um zu aktualisieren, pull die neuesten Änderungen aus dem Repository und führe anschließend mit dem Befehl `npm run build` einen Neubuild durch.

- **Fehler: `MODULE_NOT_FOUND` oder Import-Fehler.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert oder das Projekt wurde nicht gebaut.
  - **Lösung:**
    1.  Führe `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2.  Führe `npm run build` aus, um das Projekt zu kompilieren.
    3.  Überprüfe mit `npm run start`, ob der Build erfolgreich abgeschlossen wurde.

- **Fehler: „Operation not permitted“, „Permission denied“ oder Ähnliches.**
  - **Ursache:** Wenn Sandboxing aktiviert ist, kann Qwen Code versuchen, Operationen durchzuführen, die durch deine Sandbox-Konfiguration eingeschränkt sind, z. B. Schreibzugriffe außerhalb des Projektverzeichnisses oder des temporären Systemverzeichnisses.
  - **Lösung:** Weitere Informationen findest du in der Dokumentation unter [Konfiguration: Sandboxing](./cli/configuration.md#sandboxing), einschließlich Anweisungen zum Anpassen deiner Sandbox-Konfiguration.

- **Qwen Code läuft in „CI“-Umgebungen nicht im interaktiven Modus**
  - **Problem:** Qwen Code wechselt nicht in den interaktiven Modus (es erscheint keine Eingabeaufforderung), wenn eine Umgebungsvariable mit dem Präfix `CI_` (z. B. `CI_TOKEN`) gesetzt ist. Das liegt daran, dass das `is-in-ci`-Paket, das vom zugrunde liegenden UI-Framework verwendet wird, diese Variablen erkennt und eine nicht-interaktive CI-Umgebung annimmt.
  - **Ursache:** Das `is-in-ci`-Paket prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder beliebigen Umgebungsvariablen mit dem Präfix `CI_`. Wenn eine dieser Variablen gefunden wird, wird signalisiert, dass die Umgebung nicht interaktiv ist, wodurch die CLI daran gehindert wird, im interaktiven Modus zu starten.
  - **Lösung:** Falls die Variable mit dem Präfix `CI_` für die CLI nicht benötigt wird, kannst du sie vorübergehend für den Befehl deaktivieren, z. B. mit `env -u CI_TOKEN qwen`.

- **DEBUG-Modus funktioniert nicht über die .env-Datei des Projekts**
  - **Problem:** Das Setzen von `DEBUG=true` in der `.env`-Datei eines Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus Projekt-`.env`-Dateien ausgeschlossen, um Interferenzen mit dem CLI-Verhalten zu vermeiden.
  - **Lösung:** Verwende stattdessen eine `.qwen/.env`-Datei oder passe die Einstellung `excludedProjectEnvVars` in deiner `settings.json` an, um weniger Variablen auszuschließen.

## IDE Companion verbindet nicht

- Stelle sicher, dass VS Code einen einzelnen Workspace-Ordner geöffnet hat.
- Starte das integrierte Terminal neu, nachdem du die Extension installiert hast, damit es folgende Umgebungsvariablen übernimmt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn du in einem Container arbeitest, überprüfe, ob `host.docker.internal` aufgelöst werden kann. Andernfalls musst du den Host entsprechend mappen.
- Installiere den Companion neu mit `/ide install` und verwende „Qwen Code: Run“ in der Command Palette, um zu überprüfen, ob er startet.

## Exit Codes

Qwen Code verwendet spezifische Exit Codes, um den Grund für die Beendigung anzugeben. Dies ist besonders nützlich für Scripting und Automatisierung.

| Exit Code | Fehlerart                  | Beschreibung                                                                                        |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Ein Fehler ist während des Authentifizierungsprozesses aufgetreten.                                 |
| 42        | `FatalInputError`          | Ungültige oder fehlende Eingabe wurde an die CLI übergeben. (nur im nicht-interaktiven Modus)       |
| 44        | `FatalSandboxError`        | Ein Fehler ist mit der Sandbox-Umgebung aufgetreten (z. B. Docker, Podman oder Seatbelt).           |
| 52        | `FatalConfigError`         | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                        |
| 53        | `FatalTurnLimitedError`    | Die maximale Anzahl an Konversationsschritten für die Sitzung wurde erreicht. (nur im nicht-interaktiven Modus) |

## Debugging-Tipps

- **CLI-Debugging:**
  - Verwende das `--verbose`-Flag (falls verfügbar) mit CLI-Befehlen, um detailliertere Ausgaben zu erhalten.
  - Prüfe die CLI-Logs, die sich oft in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Core-Debugging:**
  - Prüfe die Server-Konsolenausgabe auf Fehlermeldungen oder Stack-Traces.
  - Erhöhe die Log-Ausführlichkeit, falls konfigurierbar.
  - Verwende Node.js-Debugging-Tools (z. B. `node --inspect`), wenn du serverseitigen Code schrittweise durchgehen musst.

- **Tool-Probleme:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuche das Problem zu isolieren, indem du die einfachste mögliche Version des Befehls oder der Operation ausführst, die das Tool durchführt.
  - Für `run_shell_command` prüfe zuerst, ob der Befehl direkt in deiner Shell funktioniert.
  - Für _Filesystem-Tools_ stelle sicher, dass die Pfade korrekt sind und überprüfe die Berechtigungen.

- **Pre-flight-Checks:**
  - Führe immer `npm run preflight` vor dem Committen von Code aus. Dies kann viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern abfangen.

## Vorhandene GitHub Issues, die deinem Problem ähneln, oder neue Issues erstellen

Falls du auf ein Problem stößt, das in diesem _Troubleshooting Guide_ nicht behandelt wird, solltest du den Qwen Code [Issue Tracker auf GitHub](https://github.com/QwenLM/qwen-code/issues) durchsuchen. Wenn du kein Issue findest, das deinem ähnelt, erstelle ein neues GitHub Issue mit einer detaillierten Beschreibung. Pull Requests sind ebenfalls willkommen!