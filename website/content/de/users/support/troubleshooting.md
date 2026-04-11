# Fehlerbehebung

Dieser Leitfaden bietet Lösungen für häufige Probleme und Debugging-Tipps, unter anderem zu folgenden Themen:

- Authentifizierungs- oder Anmeldefehler
- Häufig gestellte Fragen (FAQs)
- Debugging-Tipps
- Bestehende GitHub Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

## Authentifizierungs- oder Anmeldefehler

- **Error: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, or `unable to get local issuer certificate`**
  - **Ursache:** Du befindest dich möglicherweise in einem Unternehmensnetzwerk mit einer Firewall, die SSL/TLS-Traffic abfängt und inspiziert. Dies erfordert oft, dass ein benutzerdefiniertes Root-CA-Zertifikat von Node.js als vertrauenswürdig eingestuft wird.
  - **Lösung:** Setze die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad zu deiner Root-CA-Zertifikatsdatei des Unternehmens.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Error: `Device authorization flow failed: fetch failed`**
  - **Ursache:** Node.js konnte die Qwen OAuth-Endpunkte nicht erreichen (oft ein Proxy- oder SSL/TLS-Vertrauensproblem). Falls verfügbar, gibt Qwen Code auch die zugrunde liegende Fehlerursache aus (z. B. `UNABLE_TO_VERIFY_LEAF_SIGNATURE`).
  - **Lösung:**
    - Stelle sicher, dass du `https://chat.qwen.ai` vom selben Rechner/Netzwerk aus aufrufen kannst.
    - Wenn du hinter einem Proxy arbeitest, konfiguriere ihn über `qwen --proxy <url>` (oder die `proxy`-Einstellung in `settings.json`).
    - Wenn dein Netzwerk eine TLS-Inspection-CA des Unternehmens verwendet, setze `NODE_EXTRA_CA_CERTS` wie oben beschrieben.

- **Issue: Unable to display UI after authentication failure**
  - **Ursache:** Wenn die Authentifizierung nach der Auswahl eines Authentifizierungstyps fehlschlägt, wird die Einstellung `security.auth.selectedType` möglicherweise in `settings.json` gespeichert. Beim Neustart bleibt die CLI möglicherweise hängen, weil sie versucht, sich mit dem fehlgeschlagenen Authentifizierungstyp anzumelden, und kann die UI nicht anzeigen.
  - **Lösung:** Entferne den Konfigurationseintrag `security.auth.selectedType` in deiner `settings.json`-Datei:
    - Öffne `~/.qwen/settings.json` (oder `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entferne das Feld `security.auth.selectedType`
    - Starte die CLI neu, damit sie dich erneut zur Authentifizierung auffordert

## Häufig gestellte Fragen (FAQs)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn du es global über `npm` installiert hast, aktualisiere es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Wenn du es aus dem Quellcode kompiliert hast, ziehe die neuesten Änderungen aus dem Repository und baue es anschließend mit dem Befehl `npm run build` neu.

- **F: Wo werden die Konfigurations- oder Einstellungsdateien von Qwen Code gespeichert?**
  - A: Die Qwen Code-Konfiguration wird in zwei `settings.json`-Dateien gespeichert:
    1. In deinem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Stammverzeichnis deines Projekts: `./.qwen/settings.json`.

    Weitere Details findest du unter [Qwen Code Configuration](../configuration/settings).

- **F: Warum sehe ich keine zwischengespeicherten Token-Anzahlen in meiner Statistik-Ausgabe?**
  - A: Informationen zu zwischengespeicherten Tokens werden nur angezeigt, wenn auch tatsächlich zwischengespeicherte Tokens verwendet werden. Diese Funktion steht Nutzern mit API-Key (Qwen API-Key oder Google Cloud Vertex AI) zur Verfügung, nicht jedoch OAuth-Nutzern (z. B. Google Personal-/Enterprise-Konten wie Google Gmail oder Google Workspace). Der Grund dafür ist, dass die Qwen Code Assist API die Erstellung zwischengespeicherter Inhalte nicht unterstützt. Du kannst deine gesamte Token-Nutzung jedoch weiterhin über den Befehl `/stats` einsehen.

## Häufige Fehlermeldungen und Lösungen

- **Error: `EADDRINUSE` (Address already in use) when starting an MCP server.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den sich der MCP-Server binden möchte.
  - **Lösung:**
    Beende entweder den anderen Prozess, der den Port verwendet, oder konfiguriere den MCP-Server so, dass er einen anderen Port nutzt.

- **Error: Command not found (when attempting to run Qwen Code with `qwen`).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` deines Systems.
  - **Lösung:**
    Das Vorgehen zur Aktualisierung hängt davon ab, wie du Qwen Code installiert hast:
    - Wenn du `qwen` global installiert hast, prüfe, ob das globale `npm`-Binary-Verzeichnis in deinem `PATH` enthalten ist. Du kannst es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren.
    - Wenn du `qwen` aus dem Quellcode ausführst, stelle sicher, dass du den korrekten Befehl zum Aufrufen verwendest (z. B. `node packages/cli/dist/index.js ...`). Zum Aktualisieren ziehst du die neuesten Änderungen aus dem Repository und baust es anschließend mit `npm run build` neu.

- **Error: `MODULE_NOT_FOUND` or import errors.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert oder das Projekt wurde nicht gebaut.
  - **Lösung:**
    1. Führe `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2. Führe `npm run build` aus, um das Projekt zu kompilieren.
    3. Überprüfe mit `npm run start`, ob der Build erfolgreich abgeschlossen wurde.

- **Error: "Operation not permitted", "Permission denied", or similar.**
  - **Ursache:** Wenn Sandboxing aktiviert ist, versucht Qwen Code möglicherweise Operationen, die durch deine Sandbox-Konfiguration eingeschränkt sind, z. B. das Schreiben außerhalb des Projektverzeichnisses oder des System-Temp-Verzeichnisses.
  - **Lösung:** Weitere Informationen, einschließlich der Anpassung deiner Sandbox-Konfiguration, findest du in der Dokumentation unter [Configuration: Sandboxing](../features/sandbox).

- **Qwen Code is not running in interactive mode in "CI" environments**
  - **Issue:** Qwen Code wechselt nicht in den interaktiven Modus (es erscheint keine Eingabeaufforderung), wenn eine Umgebungsvariable gesetzt ist, die mit `CI_` beginnt (z. B. `CI_TOKEN`). Das liegt daran, dass das vom zugrunde liegenden UI-Framework genutzte Paket `is-in-ci` diese Variablen erkennt und von einer nicht-interaktiven CI-Umgebung ausgeht.
  - **Cause:** Das Paket `is-in-ci` prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder beliebigen Umgebungsvariablen mit dem Präfix `CI_`. Wird eine davon gefunden, signalisiert es, dass die Umgebung nicht-interaktiv ist, was den Start der CLI im interaktiven Modus verhindert.
  - **Solution:** Wenn die Variable mit dem `CI_`-Präfix für die Funktion der CLI nicht benötigt wird, kannst du sie vorübergehend für den Befehl deaktivieren. Z. B. `env -u CI_TOKEN qwen`

- **DEBUG mode not working from project .env file**
  - **Issue:** Das Setzen von `DEBUG=true` in der `.env`-Datei eines Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Cause:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus den `.env`-Dateien von Projekten ausgeschlossen, um Interferenzen mit dem CLI-Verhalten zu vermeiden.
  - **Solution:** Verwende stattdessen eine `.qwen/.env`-Datei oder konfiguriere die Einstellung `advanced.excludedEnvVars` in deiner `settings.json`, um weniger Variablen auszuschließen.

## IDE Companion stellt keine Verbindung her

- Stelle sicher, dass in VS Code nur ein einzelner Workspace-Ordner geöffnet ist.
- Starte das integrierte Terminal nach der Installation der Erweiterung neu, damit es folgende Variablen übernimmt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn du in einem Container arbeitest, prüfe, ob `host.docker.internal` aufgelöst wird. Andernfalls mappe den Host entsprechend.
- Installiere den Companion mit `/ide install` neu und verwende „Qwen Code: Run“ in der Befehlspalette, um den Start zu überprüfen.

## Exit-Codes

Qwen Code verwendet spezifische Exit-Codes, um den Grund für die Beendigung anzugeben. Dies ist besonders nützlich für Skripte und Automatisierung.

| Exit-Code | Error Type                 | Beschreibung                                                                                         |
| --------- | -------------------------- | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Während des Authentifizierungsprozesses ist ein Fehler aufgetreten.                                                |
| 42        | `FatalInputError`          | Der CLI wurde eine ungültige oder fehlende Eingabe übergeben. (nur im nicht-interaktiven Modus)                       |
| 44        | `FatalSandboxError`        | In der Sandbox-Umgebung ist ein Fehler aufgetreten (z. B. Docker, Podman oder Seatbelt).               |
| 52        | `FatalConfigError`         | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                               |
| 53        | `FatalTurnLimitedError`    | Die maximale Anzahl an Konversationsrunden für die Sitzung wurde erreicht. (nur im nicht-interaktiven Modus) |

## Debugging-Tipps

- **CLI-Debugging:**
  - Verwende das `--verbose`-Flag (falls verfügbar) bei CLI-Befehlen für eine detailliertere Ausgabe.
  - Prüfe die CLI-Logs, die sich häufig in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Core-Debugging:**
  - Prüfe die Konsolenausgabe des Servers auf Fehlermeldungen oder Stack Traces.
  - Erhöhe die Log-Verbosität, falls konfigurierbar.
  - Verwende Node.js-Debugging-Tools (z. B. `node --inspect`), wenn du serverseitigen Code schrittweise durchgehen musst.

- **Tool-Probleme:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuche, das Problem zu isolieren, indem du die einfachste mögliche Version des Befehls oder der Operation ausführst, die das Tool ausführt.
  - Prüfe bei `run_shell_command` zuerst, ob der Befehl direkt in deiner Shell funktioniert.
  - Überprüfe bei _Dateisystem-Tools_, ob die Pfade korrekt sind, und prüfe die Berechtigungen.

- **Pre-flight-Checks:**
  - Führe immer `npm run preflight` aus, bevor du Code committest. Damit lassen sich viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern frühzeitig erkennen.

## Bestehende GitHub Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

Wenn du auf ein Problem stößt, das in diesem _Leitfaden zur Fehlerbehebung_ nicht behandelt wird, durchsuche zunächst den [Issue-Tracker von Qwen Code auf GitHub](https://github.com/QwenLM/qwen-code/issues). Falls du kein ähnliches Issue findest, erwäge, ein neues GitHub Issue mit einer detaillierten Beschreibung zu erstellen. Pull Requests sind ebenfalls willkommen!