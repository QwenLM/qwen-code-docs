# Fehlerbehebung

Dieser Leitfaden bietet Lösungen für häufige Probleme und Tipps zum Debugging, unter anderem zu folgenden Themen:

- Authentifizierungs- oder Anmeldefehler
- Häufig gestellte Fragen (FAQs)
- Tipps zum Debugging
- Bestehende GitHub Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

## Authentifizierungs- oder Anmeldefehler

- **Fehler: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Ursache:** Qwen OAuth ist seit dem 15. April 2026 nicht mehr verfügbar.
  - **Lösung:** Wechsle zu einer anderen Authentifizierungsmethode. Führe `qwen` → `/auth` aus und wähle eine der folgenden Optionen:
    - **API Key**: Verwende einen API Key von Alibaba Cloud Model Studio ([Beijing](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Siehe die API-Einrichtungsanleitung ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan**: Abonniere einen Plan mit fester monatlicher Gebühr und höheren Kontingenten. Siehe die Coding-Plan-Anleitung ([Beijing](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` oder `unable to get local issuer certificate`**
  - **Ursache:** Du befindest dich möglicherweise in einem Unternehmensnetzwerk mit einer Firewall, die SSL/TLS-Traffic abfängt und inspiziert. Dies erfordert oft, dass Node.js ein benutzerdefiniertes Root-CA-Zertifikat als vertrauenswürdig einstuft.
  - **Lösung:** Setze die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad zu deiner Root-CA-Zertifikatsdatei des Unternehmens.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/path/to/your/corporate-ca.crt`

- **Fehler: `Device authorization flow failed: fetch failed`**
  - **Ursache:** Node.js konnte die Qwen OAuth-Endpunkte nicht erreichen (oft ein Proxy- oder SSL/TLS-Vertrauensproblem). Falls verfügbar, gibt Qwen Code auch die zugrunde liegende Fehlerursache aus (z. B. `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Hinweis: Dieser Fehler ist spezifisch für den veralteten Qwen OAuth-Flow.
  - **Lösung:**
    - Wenn du noch Qwen OAuth verwendest, wechsle über `/auth` zu API Key oder Coding Plan.
    - Wenn du dich hinter einem Proxy befindest, konfiguriere ihn über `qwen --proxy <url>` (oder die `proxy`-Einstellung in `settings.json`).
    - Wenn dein Netzwerk eine TLS-Inspection-CA des Unternehmens verwendet, setze `NODE_EXTRA_CA_CERTS` wie oben beschrieben.

- **Problem: UI wird nach Authentifizierungsfehler nicht angezeigt**
  - **Ursache:** Wenn die Authentifizierung nach der Auswahl eines Authentifizierungstyps fehlschlägt, wird die Einstellung `security.auth.selectedType` möglicherweise in `settings.json` gespeichert. Beim Neustart kann die CLI hängen bleiben, wenn sie versucht, sich mit dem fehlgeschlagenen Auth-Typ zu authentifizieren, und die UI wird nicht angezeigt.
  - **Lösung:** Entferne den Konfigurationseintrag `security.auth.selectedType` in deiner `settings.json`-Datei:
    - Öffne `~/.qwen/settings.json` (oder `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entferne das Feld `security.auth.selectedType`
    - Starte die CLI neu, damit sie erneut zur Authentifizierung auffordert

## Häufig gestellte Fragen (FAQs)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn du es global über `npm` installiert hast, aktualisiere es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Wenn du es aus dem Quellcode kompiliert hast, ziehe die neuesten Änderungen aus dem Repository und baue es anschließend mit dem Befehl `npm run build` neu.

- **F: Wo werden die Konfigurations- oder Einstellungsdateien von Qwen Code gespeichert?**
  - A: Die Qwen Code-Konfiguration wird in zwei `settings.json`-Dateien gespeichert:
    1. In deinem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Root-Verzeichnis deines Projekts: `./.qwen/settings.json`.

    Weitere Details findest du unter [Qwen Code Configuration](../configuration/settings).

- **F: Warum sehe ich keine zwischengespeicherten Token-Anzahlen in meiner Statistik-Ausgabe?**
  - A: Informationen zu zwischengespeicherten Tokens werden nur angezeigt, wenn auch tatsächlich zwischengespeicherte Tokens verwendet werden. Dieses Feature ist für API-Key-Nutzer verfügbar (z. B. Alibaba Cloud Model Studio API Key oder Google Cloud Vertex AI). Du kannst deine gesamte Token-Nutzung weiterhin mit dem Befehl `/stats` einsehen.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Address already in use) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den sich der MCP-Server binden möchte.
  - **Lösung:**
    Beende entweder den anderen Prozess, der den Port verwendet, oder konfiguriere den MCP-Server so, dass er einen anderen Port nutzt.

- **Fehler: Command not found (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` deines Systems.
  - **Lösung:**
    Die Lösung hängt davon ab, wie du Qwen Code installiert hast:
    - Wenn du `qwen` global installiert hast, prüfe, ob das globale Binärverzeichnis von `npm` in deinem `PATH` enthalten ist. Du kannst es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren.
    - Wenn du `qwen` aus dem Quellcode ausführst, stelle sicher, dass du den korrekten Befehl zum Starten verwendest (z. B. `node packages/cli/dist/index.js ...`). Zum Aktualisieren ziehe die neuesten Änderungen aus dem Repository und baue es anschließend mit dem Befehl `npm run build` neu.

- **Fehler: `MODULE_NOT_FOUND` oder Import-Fehler.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert oder das Projekt wurde nicht gebaut.
  - **Lösung:**
    1.  Führe `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2.  Führe `npm run build` aus, um das Projekt zu kompilieren.
    3.  Überprüfe mit `npm run start`, ob der Build erfolgreich abgeschlossen wurde.

- **Fehler: "Operation not permitted", "Permission denied" oder Ähnliches.**
  - **Ursache:** Wenn Sandboxing aktiviert ist, versucht Qwen Code möglicherweise Operationen, die durch deine Sandbox-Konfiguration eingeschränkt sind, z. B. das Schreiben außerhalb des Projektverzeichnisses oder des systemweiten Temp-Verzeichnisses.
  - **Lösung:** Weitere Informationen, einschließlich der Anpassung deiner Sandbox-Konfiguration, findest du in der Dokumentation [Configuration: Sandboxing](../features/sandbox).

- **Qwen Code läuft in "CI"-Umgebungen nicht im interaktiven Modus**
  - **Problem:** Qwen Code wechselt nicht in den interaktiven Modus (keine Eingabeaufforderung erscheint), wenn eine Umgebungsvariable gesetzt ist, die mit `CI_` beginnt (z. B. `CI_TOKEN`). Das liegt daran, dass das `is-in-ci`-Paket, das vom zugrunde liegenden UI-Framework verwendet wird, diese Variablen erkennt und von einer nicht-interaktiven CI-Umgebung ausgeht.
  - **Ursache:** Das `is-in-ci`-Paket prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder beliebigen Umgebungsvariablen mit dem Präfix `CI_`. Wenn eine davon gefunden wird, signalisiert es, dass die Umgebung nicht-interaktiv ist, was den Start der CLI im interaktiven Modus verhindert.
  - **Lösung:** Wenn die Variable mit dem `CI_`-Präfix für die Funktion der CLI nicht benötigt wird, kannst du sie temporär für den Befehl deaktivieren. Z. B. `env -u CI_TOKEN qwen`

- **DEBUG-Modus funktioniert nicht über die .env-Datei des Projekts**
  - **Problem:** Das Setzen von `DEBUG=true` in der `.env`-Datei eines Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus den `.env`-Dateien von Projekten ausgeschlossen, um Interferenzen mit dem CLI-Verhalten zu vermeiden.
  - **Lösung:** Verwende stattdessen eine `.qwen/.env`-Datei oder konfiguriere die Einstellung `advanced.excludedEnvVars` in deiner `settings.json`, um weniger Variablen auszuschließen.

## IDE Companion verbindet sich nicht

- Stelle sicher, dass in VS Code nur ein einzelner Workspace-Ordner geöffnet ist.
- Starte das integrierte Terminal nach der Installation der Extension neu, damit es folgende Variablen übernimmt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn du in einem Container arbeitest, prüfe, ob `host.docker.internal` aufgelöst wird. Andernfalls mappe den Host entsprechend.
- Installiere den Companion mit `/ide install` neu und verwende „Qwen Code: Run“ in der Command Palette, um zu prüfen, ob er startet.

## Exit-Codes

Qwen Code verwendet spezifische Exit-Codes, um den Grund für die Beendigung anzugeben. Dies ist besonders nützlich für Skripting und Automatisierung.

| Exit-Code | Fehlertyp                | Beschreibung                                                                                        |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError` | Während des Authentifizierungsprozesses ist ein Fehler aufgetreten.                                   |
| 42        | `FatalInputError`          | Der CLI wurde eine ungültige oder fehlende Eingabe übergeben. (nur im nicht-interaktiven Modus)       |
| 44        | `FatalSandboxError`        | In der Sandbox-Umgebung ist ein Fehler aufgetreten (z. B. Docker, Podman oder Seatbelt).              |
| 52        | `FatalConfigError`         | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                          |
| 53        | `FatalTurnLimitedError`    | Die maximale Anzahl an Konversationsrunden für die Sitzung wurde erreicht. (nur im nicht-interaktiven Modus) |

## Tipps zum Debugging

- **CLI-Debugging:**
  - Verwende das `--verbose`-Flag (falls verfügbar) bei CLI-Befehlen für eine detailliertere Ausgabe.
  - Prüfe die CLI-Logs, die sich häufig in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Core-Debugging:**
  - Prüfe die Konsolenausgabe des Servers auf Fehlermeldungen oder Stack Traces.
  - Erhöhe bei Bedarf die Log-Verbosität, falls konfigurierbar.
  - Verwende Node.js-Debugging-Tools (z. B. `node --inspect`), wenn du serverseitigen Code schrittweise durchgehen musst.

- **Tool-Probleme:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuche, das Problem zu isolieren, indem du die einfachste mögliche Version des Befehls oder der Operation ausführst, die das Tool ausführt.
  - Für `run_shell_command`: Prüfe zuerst, ob der Befehl direkt in deiner Shell funktioniert.
  - Für _Dateisystem-Tools_: Überprüfe, ob die Pfade korrekt sind, und prüfe die Berechtigungen.

- **Pre-flight-Checks:**
  - Führe immer `npm run preflight` aus, bevor du Code committest. Damit lassen sich viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern frühzeitig erkennen.

## Bestehende GitHub Issues, die deinem Problem ähneln, oder Erstellen neuer Issues

Wenn du auf ein Problem stößt, das in diesem _Troubleshooting-Leitfaden_ nicht behandelt wird, durchsuche den [Issue-Tracker von Qwen Code auf GitHub](https://github.com/QwenLM/qwen-code/issues). Wenn du kein ähnliches Issue findest, erwäge, ein neues GitHub Issue mit einer detaillierten Beschreibung zu erstellen. Pull Requests sind ebenfalls willkommen!