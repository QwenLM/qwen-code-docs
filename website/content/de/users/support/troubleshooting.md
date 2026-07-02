# Fehlerbehebung

Dieser Leitfaden bietet Lösungen für häufige Probleme und Tipps zur Fehlerbehebung, einschließlich der folgenden Themen:

- Authentifizierungs- oder Anmeldefehler
- Häufig gestellte Fragen (FAQs)
- Tipps zum Debugging
- Bestehende GitHub Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

## Authentifizierungs- oder Anmeldefehler

- **Fehler: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Ursache:** Qwen OAuth ist seit dem 15. April 2026 nicht mehr verfügbar.
  - **Lösung:** Wechsle zu einer anderen Authentifizierungsmethode. Führe `qwen` → `/auth` aus und wähle eine der folgenden Optionen:
    - **API Key**: Verwende einen API key aus der Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Siehe die API-Einrichtungsanleitung ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan**: Abonniere den Plan zu einer festen monatlichen Gebühr mit höheren Quotas. Siehe den Coding-Plan-Leitfaden ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` oder `unable to get local issuer certificate`**
  - **Ursache:** Möglicherweise befindest du dich in einem Unternehmensnetzwerk mit einer Firewall, die SSL/TLS-Datenverkehr abfängt und untersucht. Dies erfordert oft, dass ein benutzerdefiniertes Root-CA-Zertifikat von Node.js als vertrauenswürdig eingestuft wird.
  - **Lösung:** Setze die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad deiner Root-CA-Zertifikatsdatei des Unternehmens.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Fehler: `Connection error. (cause: fetch failed)` bei einem Endpunkt mit selbstsigniertem Zertifikat**
  - **Ursache:** Du verbindest Qwen Code mit einem selbst gehosteten Server (z. B. einem lokalen Modell hinter `https://`), dessen TLS-Zertifikat selbstsigniert ist, weshalb Node.js es ablehnt.
  - **Lösung:** Es wird empfohlen, dem Zertifikat über `NODE_EXTRA_CA_CERTS` (siehe oben) zu vertrauen. Wenn dies in einem vertrauenswürdigen Labor-/privaten Netzwerk nicht praktikabel ist, überspringe die Verifizierung mit dem `--insecure`-Flag (oder `QWEN_TLS_INSECURE=1`):
    - Beispiel: `qwen --insecure --openaiBaseUrl https://192.168.1.10:8080 ...`
    - **Warnung:** Das Deaktivieren der Verifizierung entfernt den Schutz vor Man-in-the-Middle-Angriffen. Verwende dies nur für Endpunkte, denen du vollständig vertraust.

- **Fehler: `Device authorization flow failed: fetch failed`**
  - **Ursache:** Node.js konnte die Qwen OAuth-Endpunkte nicht erreichen (oft ein Proxy- oder SSL/TLS-Vertrauensproblem). Wenn verfügbar, gibt Qwen Code auch die zugrunde liegende Fehlerursache aus (z. B.: `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Hinweis: Dieser Fehler ist spezifisch für den Legacy-Qwen-OAuth-Flow.
  - **Lösung:**
    - Wenn du noch Qwen OAuth verwendest, wechsle über `/auth` zu API Key oder Coding Plan.
    - Wenn du dich hinter einem Proxy befindest, konfiguriere ihn über `qwen --proxy <url>` (oder die `proxy`-Einstellung in `settings.json`).
    - Wenn dein Netzwerk eine Corporate-TLS-Inspection-CA verwendet, setze `NODE_EXTRA_CA_CERTS` wie oben beschrieben.

- **Problem: UI kann nach Authentifizierungsfehler nicht angezeigt werden**
  - **Ursache:** Wenn die Authentifizierung nach der Auswahl eines Authentifizierungstyps fehlschlägt, wird die Einstellung `security.auth.selectedType` möglicherweise in `settings.json` gespeichert. Beim Neustart bleibt die CLI möglicherweise hängen, wenn sie versucht, sich mit dem fehlgeschlagenen Authentifizierungstyp zu authentifizieren, und kann die UI nicht anzeigen.
  - **Lösung:** Lösche den Konfigurationseintrag `security.auth.selectedType` in deiner `settings.json`-Datei:
    - Öffne `~/.qwen/settings.json` (oder `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entferne das Feld `security.auth.selectedType`
    - Starte die CLI neu, damit sie erneut nach der Authentifizierung fragt

## Häufig gestellte Fragen (FAQs)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn du Qwen Code mit dem Standalone-Installer installiert hast, führe den Standalone-Installationsbefehl erneut aus. Wenn du es global über `npm` installiert hast, aktualisiere es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Wenn du es aus dem Quellcode kompiliert hast, hole die neuesten Änderungen aus dem Repository und baue es dann mit dem Befehl `npm run build` neu.

- **F: Wo werden die Konfigurations- oder Einstellungsdateien von Qwen Code gespeichert?**
  - A: Die Qwen Code-Konfiguration wird in zwei `settings.json`-Dateien gespeichert:
    1. In deinem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Stammverzeichnis deines Projekts: `./.qwen/settings.json`.

    Weitere Details findest du in der [Qwen Code-Konfiguration](../configuration/settings).

- **F: Warum werden in der Stats-Ausgabe keine Cached-Token-Counts angezeigt?**
  - A: Informationen zu zwischengespeicherten Tokens werden nur angezeigt, wenn auch tatsächlich zwischengespeicherte Tokens verwendet werden. Diese Funktion ist für API-Key-Nutzer verfügbar (z. B. Alibaba Cloud Model Studio API key oder Google Cloud Vertex AI). Du kannst dir deine gesamte Token-Nutzung weiterhin mit dem Befehl `/stats` anzeigen lassen.

- **F: Eine Anpassung (Extension, Hook, Skill, MCP-Server oder Subagent) scheint Qwen Code zu beeinträchtigen. Wie kann ich die Ursache isolieren?**
  - A: Starte Qwen Code mit dem `--safe-mode`-Flag, um alle Anpassungen für die Sitzung zu deaktivieren – Kontextdateien, Hooks, Extensions, Skills, MCP-Server, benutzerdefinierte Subagents (nur integrierte Subagents werden geladen), Berechtigungsregeln, aus den Einstellungen übernommene Approval-Mode-Overrides, Speicherfunktionen und Sandbox-Einstellungen. Hinweis: Die CLI-Flags `--yolo` und `--approval-mode` sind im Safe Mode weiterhin wirksam. Wenn das Problem im Safe Mode nicht mehr auftritt, aktiviere deine Anpassungen nacheinander wieder, um den Verursacher zu finden.
    - Beispiel: `qwen --safe-mode`
    - Alternative: Setze die Umgebungsvariable `QWEN_CODE_SAFE_MODE=true`, wenn die CLI keine Flags akzeptieren kann.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Address already in use) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den der MCP-Server binden möchte.
  - **Lösung:**
    Stoppe entweder den anderen Prozess, der den Port verwendet, oder konfiguriere den MCP-Server so, dass er einen anderen Port verwendet.

- **Fehler: Command not found (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` deines Systems.
  - **Lösung:**
    Die Aktualisierung hängt davon ab, wie du Qwen Code installiert hast:
    - Wenn du `qwen` mit dem Standalone-Installer installiert hast, führe den Standalone-Installationsbefehl erneut aus und öffne dann ein neues Terminal.
    - Wenn du `qwen` global installiert hast, stelle sicher, dass das globale `npm`-Binärverzeichnis in deinem `PATH` enthalten ist. Du kannst es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren.
    - Wenn du `qwen` aus dem Quellcode ausführst, stelle sicher, dass du den richtigen Befehl zum Aufrufen verwendest (z. B. `node packages/cli/dist/index.js ...`). Zum Aktualisieren hole die neuesten Änderungen aus dem Repository und baue es dann mit dem Befehl `npm run build` neu.

- **Fehler: `MODULE_NOT_FOUND` oder Importfehler.**
  - **Ursache:** Dependencies sind nicht korrekt installiert oder das Projekt wurde nicht gebaut.
  - **Lösung:**
    1.  Führe `npm install` aus, um sicherzustellen, dass alle Dependencies vorhanden sind.
    2.  Führe `npm run build` aus, um das Projekt zu kompilieren.
    3.  Überprüfe mit `npm run start`, ob der Build erfolgreich abgeschlossen wurde.

- **Fehler: "Operation not permitted", "Permission denied" oder ähnlich.**
  - **Ursache:** Wenn Sandboxing aktiviert ist, versucht Qwen Code möglicherweise Operationen, die durch deine Sandbox-Konfiguration eingeschränkt sind, wie z. B. das Schreiben außerhalb des Projektverzeichnisses oder des System-Temp-Verzeichnisses.
  - **Lösung:** Weitere Informationen, einschließlich der Anpassung deiner Sandbox-Konfiguration, findest du in der Dokumentation [Konfiguration: Sandboxing](../features/sandbox).

- **Qwen Code wird in "CI"-Umgebungen nicht im interaktiven Modus ausgeführt**
  - **Problem:** Qwen Code wechselt nicht in den interaktiven Modus (es erscheint kein Prompt), wenn eine Umgebungsvariable gesetzt ist, die mit `CI_` beginnt (z. B. `CI_TOKEN`). Der Grund dafür ist, dass das vom zugrunde liegenden UI-Framework verwendete Paket `is-in-ci` diese Variablen erkennt und von einer nicht-interaktiven CI-Umgebung ausgeht.
  - **Ursache:** Das Paket `is-in-ci` prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder einer beliebigen Umgebungsvariable mit dem Präfix `CI_`. Wenn eine dieser Variablen gefunden wird, signalisiert dies, dass die Umgebung nicht-interaktiv ist, was die CLI daran hindert, in ihrem interaktiven Modus zu starten.
  - **Lösung:** Wenn die Variable mit dem `CI_`-Präfix für die Funktion der CLI nicht benötigt wird, kannst du sie für den Befehl temporär entfernen, z. B. `env -u CI_TOKEN qwen`

- **DEBUG-Modus funktioniert nicht über die .env-Datei des Projekts**
  - **Problem:** Das Setzen von `DEBUG=true` in der `.env`-Datei eines Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus den `.env`-Dateien des Projekts ausgeschlossen, um Interferenzen mit dem Verhalten der CLI zu verhindern.
  - **Lösung:** Verwende stattdessen eine `.qwen/.env`-Datei oder konfiguriere die Einstellung `advanced.excludedEnvVars` in deiner `settings.json`, um weniger Variablen auszuschließen.

- **Trackpad-Scrollen in tmux ändert die Prompt-Historie, anstatt durch die Konversation zu scrollen**
  - **Problem:** In einer tmux-Sitzung kann das Scrollen mit dem Trackpad oder Mausrad durch vorherige Prompts blättern, ähnlich wie das Drücken von `Pfeil nach oben` oder `Pfeil nach unten`.
  - **Ursache:** tmux kann Radgesten in einfache Pfeiltasten-Sequenzen übersetzen. Diese Sequenzen sind für qwen-code nicht mehr von echten Pfeiltastendrücken zu unterscheiden.
  - **Lösung:** Aktiviere `ui.useTerminalBuffer`; verwende dann `Shift+Up` / `Shift+Down` oder das Mausrad, wenn tmux Radereignisse an die App weiterleitet. Wenn du den Host-Scrollback bevorzugst, passe deine tmux-Mausbindungen für Radereignisse an.

## IDE Companion verbindet nicht

- Stelle sicher, dass in VS Code nur ein einzelner Workspace-Ordner geöffnet ist.
- Starte das integrierte Terminal nach der Installation der Extension neu, damit es Folgendes erbt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn es in einem Container ausgeführt wird, überprüfe, ob `host.docker.internal` aufgelöst wird. Andernfalls mappe den Host entsprechend.
- Installiere den Companion mit `/ide install` neu und verwende „Qwen Code: Run“ in der Command Palette, um zu überprüfen, ob er gestartet wird.

## Exit Codes

Qwen Code verwendet spezifische Exit Codes, um den Grund für die Beendigung anzugeben. Dies ist besonders nützlich für Skripting und Automatisierung.

| Exit Code | Fehlertyp                  | Beschreibung                                                                                      |
| --------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Ein Fehler ist während des Authentifizierungsprozesses aufgetreten.                               |
| 42        | `FatalInputError`          | Der CLI wurde eine ungültige oder fehlende Eingabe übergeben. (nur im nicht-interaktiven Modus)   |
| 44        | `FatalSandboxError`        | Ein Fehler ist in der Sandboxing-Umgebung aufgetreten (z. B. Docker, Podman oder Seatbelt).       |
| 52        | `FatalConfigError`         | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                      |
| 53        | `FatalTurnLimitedError`    | Die maximale Anzahl an Konversationsrunden für die Sitzung wurde erreicht. (nur im nicht-interaktiven Modus) |

## Tipps zum Debugging

- **CLI-Debugging:**
  - Verwende das `--verbose`-Flag (falls verfügbar) bei CLI-Befehlen für eine detailliertere Ausgabe.
  - Überprüfe die CLI-Logs, die sich oft in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Core-Debugging:**
  - Überprüfe die Server-Konsolenausgabe auf Fehlermeldungen oder Stack Traces.
  - Erhöhe die Ausführlichkeit der Logs, wenn dies konfigurierbar ist.
  - Verwende Node.js-Debugging-Tools (z. B. `node --inspect`), wenn du serverseitigen Code schrittweise durchlaufen musst.

- **Tool-Probleme:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuche, das Problem zu isolieren, indem du die einfachstmögliche Version des Befehls oder der Operation ausführst, die das Tool durchführt.
  - Überprüfe bei `run_shell_command` zuerst, ob der Befehl direkt in deiner Shell funktioniert.
  - Überprüfe bei _Dateisystem-Tools_, ob die Pfade korrekt sind, und prüfe die Berechtigungen.

- **Pre-Flight-Checks:**
  - Führe immer `npm run preflight` aus, bevor du Code committest. Dies kann viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern abfangen.

## Bestehende GitHub Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

Wenn du auf ein Problem stößt, das in diesem _Fehlerbehebungsleitfaden_ nicht behandelt wird, durchsuche den Qwen Code [Issue Tracker auf GitHub](https://github.com/QwenLM/qwen-code/issues). Wenn du kein Issue findest, das deinem Problem ähnelt, erstelle ein neues GitHub Issue mit einer detaillierten Beschreibung. Pull Requests sind ebenfalls willkommen!