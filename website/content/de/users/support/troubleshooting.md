# Fehlerbehebung

Diese Anleitung bietet Lösungen für häufige Probleme und Debugging-Tipps, einschließlich Themen wie:

- Authentifizierungs- oder Anmeldefehler
- Häufig gestellte Fragen (FAQs)
- Debugging-Tipps
- Bereits vorhandene GitHub Issues ähnlich zu Ihren oder das Erstellen neuer Issues

## Authentifizierungs- oder Anmeldefehler

- **Fehler: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Ursache:** Qwen OAuth ist seit dem 15. April 2026 nicht mehr verfügbar.
  - **Lösung:** Wechseln Sie zu einer anderen Authentifizierungsmethode. Führen Sie `qwen` → `/auth` aus und wählen Sie eine der folgenden:
    - **API-Schlüssel**: Verwenden Sie einen API-Schlüssel von Alibaba Cloud Model Studio ([Peking](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Siehe die API-Einrichtungsanleitung ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan**: Abonnieren Sie einen festen monatlichen Betrag mit höheren Kontingenten. Siehe die Coding-Plan-Anleitung ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` oder `unable to get local issuer certificate`**
  - **Ursache:** Möglicherweise befinden Sie sich in einem Unternehmensnetzwerk mit einer Firewall, die den SSL/TLS-Verkehr abfängt und prüft. Dies erfordert oft, dass ein benutzerdefiniertes Root-CA-Zertifikat von Node.js als vertrauenswürdig eingestuft wird.
  - **Lösung:** Setzen Sie die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad zu Ihrer Unternehmens-Root-CA-Zertifikatsdatei.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/pfad/zu/ihrem/unternehmens-ca.crt`

- **Fehler: `Device authorization flow failed: fetch failed`**
  - **Ursache:** Node.js konnte die Qwen OAuth-Endpunkte nicht erreichen (oft ein Proxy- oder SSL/TLS-Vertrauensproblem). Wenn verfügbar, gibt Qwen Code auch die zugrunde liegende Fehlerursache aus (z. B. `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Hinweis: Dieser Fehler tritt spezifisch beim veralteten Qwen OAuth-Flow auf.
  - **Lösung:**
    - Wenn Sie noch Qwen OAuth verwenden, wechseln Sie über `/auth` zu einem API-Schlüssel oder Coding Plan.
    - Wenn Sie hinter einem Proxy sind, konfigurieren Sie diesen über `qwen --proxy <url>` (oder die Einstellung `proxy` in `settings.json`).
    - Wenn Ihr Netzwerk ein Unternehmens-TLS-Prüfzertifikat verwendet, setzen Sie `NODE_EXTRA_CA_CERTS` wie oben beschrieben.

- **Problem: Nach einem Authentifizierungsfehler kann die Benutzeroberfläche nicht angezeigt werden**
  - **Ursache:** Wenn die Authentifizierung nach Auswahl eines Authentifizierungstyps fehlschlägt, kann die Einstellung `security.auth.selectedType` in `settings.json` gespeichert bleiben. Beim Neustart kann die CLI versuchen, sich mit dem fehlgeschlagenen Authentifizierungstyp zu authentifizieren und die Benutzeroberfläche nicht anzeigen.
  - **Lösung:** Löschen Sie den Konfigurationseintrag `security.auth.selectedType` in Ihrer `settings.json`-Datei:
    - Öffnen Sie `~/.qwen/settings.json` (oder `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entfernen Sie das Feld `security.auth.selectedType`
    - Starten Sie die CLI neu, damit sie erneut zur Authentifizierung auffordert

## Häufig gestellte Fragen (FAQs)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn Sie Qwen Code mit dem eigenständigen Installer installiert haben, führen Sie den eigenständigen Installationsbefehl erneut aus. Wenn Sie es global über `npm` installiert haben, aktualisieren Sie es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Wenn Sie es aus dem Quellcode kompiliert haben, holen Sie die neuesten Änderungen aus dem Repository und erstellen Sie es mit dem Befehl `npm run build` neu.

- **F: Wo werden die Konfigurations- oder Einstellungsdateien von Qwen Code gespeichert?**
  - A: Die Qwen Code-Konfiguration wird in zwei `settings.json`-Dateien gespeichert:
    1. In Ihrem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Stammverzeichnis Ihres Projekts: `./.qwen/settings.json`.

    Weitere Informationen finden Sie unter [Qwen Code-Konfiguration](../configuration/settings).

- **F: Warum sehe ich keine zwischengespeicherten Token-Anzahlen in meiner Statistikausgabe?**
  - A: Informationen zu zwischengespeicherten Token werden nur angezeigt, wenn zwischengespeicherte Token verwendet werden. Diese Funktion ist für API-Schlüssel-Benutzer verfügbar (z. B. Alibaba Cloud Model Studio API-Schlüssel oder Google Cloud Vertex AI). Sie können Ihre gesamte Token-Nutzung weiterhin mit dem Befehl `/stats` anzeigen.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Adresse bereits verwendet) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den der MCP-Server binden möchte.
  - **Lösung:**
    Stoppen Sie entweder den anderen Prozess, der den Port verwendet, oder konfigurieren Sie den MCP-Server so, dass er einen anderen Port verwendet.

- **Fehler: Befehl nicht gefunden (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` Ihres Systems.
  - **Lösung:**
    Die Aktualisierung hängt davon ab, wie Sie Qwen Code installiert haben:
    - Wenn Sie `qwen` mit dem eigenständigen Installer installiert haben, führen Sie den eigenständigen Installationsbefehl erneut aus und öffnen Sie dann ein neues Terminal.
    - Wenn Sie `qwen` global installiert haben, überprüfen Sie, ob das globale Binärverzeichnis von `npm` in Ihrem `PATH` enthalten ist. Sie können mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren.
    - Wenn Sie `qwen` aus dem Quellcode ausführen, stellen Sie sicher, dass Sie den richtigen Befehl zum Aufrufen verwenden (z. B. `node packages/cli/dist/index.js ...`). Um zu aktualisieren, holen Sie die neuesten Änderungen aus dem Repository und erstellen Sie es mit dem Befehl `npm run build` neu.
- **Fehler: `MODULE_NOT_FOUND` oder Importfehler.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert, oder das Projekt wurde nicht gebaut.
  - **Lösung:**
    1. Führen Sie `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2. Führen Sie `npm run build` aus, um das Projekt zu kompilieren.
    3. Überprüfen Sie, ob der Build erfolgreich war, mit `npm run start`.

- **Fehler: "Vorgang nicht zulässig", "Keine Berechtigung" oder ähnliches.**
  - **Ursache:** Wenn Sandboxing aktiviert ist, kann Qwen Code Vorgänge ausführen, die durch Ihre Sandbox-Konfiguration eingeschränkt sind, z. B. Schreibzugriff außerhalb des Projektverzeichnisses oder des temporären Systemverzeichnisses.
  - **Lösung:** Weitere Informationen finden Sie in der Dokumentation [Konfiguration: Sandboxing](../features/sandbox), einschließlich der Anpassung Ihrer Sandbox-Konfiguration.

- **Qwen Code wird in "CI"-Umgebungen nicht im interaktiven Modus ausgeführt**
  - **Problem:** Qwen Code startet nicht im interaktiven Modus (keine Eingabeaufforderung erscheint), wenn eine Umgebungsvariable gesetzt ist, die mit `CI_` beginnt (z. B. `CI_TOKEN`). Dies liegt daran, dass das Paket `is-in-ci`, das vom zugrunde liegenden UI-Framework verwendet wird, diese Variablen erkennt und von einer nicht interaktiven CI-Umgebung ausgeht.
  - **Ursache:** Das Paket `is-in-ci` prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder einer Umgebungsvariable mit dem Präfix `CI_`. Wenn eine davon gefunden wird, signalisiert dies, dass die Umgebung nicht interaktiv ist, was verhindert, dass die CLI im interaktiven Modus startet.
  - **Lösung:** Wenn die Variable mit `CI_`-Präfix für die CLI-Funktion nicht benötigt wird, können Sie sie für den Befehl vorübergehend entfernen. Z. B. `env -u CI_TOKEN qwen`

- **DEBUG-Modus funktioniert nicht über .env-Datei des Projekts**
  - **Problem:** Das Setzen von `DEBUG=true` in einer `.env`-Datei eines Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus den `.env`-Dateien des Projekts ausgeschlossen, um eine Beeinträchtigung des CLI-Verhaltens zu verhindern.
  - **Lösung:** Verwenden Sie stattdessen eine `.qwen/.env`-Datei oder passen Sie die Einstellung `advanced.excludedEnvVars` in Ihrer `settings.json` an, um weniger Variablen auszuschließen.

- **Trackpad-Scrollen in tmux ändert die Eingabehistory anstatt den Chat zu scrollen**
  - **Problem:** In einer tmux-Sitzung kann das Scrollen mit dem Trackpad oder dem Mausrad durch vorherige Prompts blättern, vergleichbar mit dem Drücken von `Pfeil nach oben` oder `Pfeil nach unten`.
  - **Ursache:** tmux kann Rädchengesten in einfache Pfeiltasten-Sequenzen übersetzen. Diese Sequenzen sind für qwen-code nicht von echten Pfeiltastendrücken zu unterscheiden.
  - **Lösung:** Aktivieren Sie `ui.useTerminalBuffer`; verwenden Sie dann `Umschalt+Pfeil oben` / `Umschalt+Pfeil unten` oder das Mausrad, wenn tmux Rädchenereignisse an die Anwendung weiterleitet. Wenn Sie den Host-Scrollback bevorzugen, passen Sie Ihre tmux-Mausbindungen für Rädchenereignisse an.

## IDE Companion verbindet sich nicht

- Stellen Sie sicher, dass VS Code einen einzelnen Arbeitsbereichsordner geöffnet hat.
- Starten Sie das integrierte Terminal nach der Installation der Erweiterung neu, damit es Folgendes erbt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn die Ausführung in einem Container erfolgt, überprüfen Sie, ob `host.docker.internal` aufgelöst wird. Andernfalls mappen Sie den Host entsprechend.
- Installieren Sie den Companion mit `/ide install` neu und verwenden Sie „Qwen Code: Ausführen“ in der Befehlspalette, um den Start zu überprüfen.

## Exit-Codes

Qwen Code verwendet spezifische Exit-Codes, um den Grund für die Beendigung anzuzeigen. Dies ist besonders nützlich für Skripting und Automatisierung.

| Exit-Code | Fehlertyp                   | Beschreibung                                                                                         |
| --------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError`  | Während des Authentifizierungsprozesses ist ein Fehler aufgetreten.                                  |
| 42        | `FatalInputError`           | Es wurde eine ungültige oder fehlende Eingabe an die CLI übergeben. (nur im nicht-interaktiven Modus)|
| 44        | `FatalSandboxError`         | Ein Fehler in der Sandbox-Umgebung (z. B. Docker, Podman oder Seatbelt).                             |
| 52        | `FatalConfigError`          | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                         |
| 53        | `FatalTurnLimitedError`     | Die maximale Anzahl von Gesprächsrunden für die Sitzung wurde erreicht. (nur nicht-interaktiver Modus)|

## Tipps zur Fehlersuche (Debugging)

- **CLI-Debugging:**
  - Verwenden Sie das Flag `--verbose` (falls verfügbar) mit CLI-Befehlen für detailliertere Ausgaben.
  - Überprüfen Sie die CLI-Protokolle, die sich häufig in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.

- **Core-Debugging:**
  - Überprüfen Sie die Server-Konsolenausgabe auf Fehlermeldungen oder Stack-Traces.
  - Erhöhen Sie die Ausführlichkeit der Protokolle, falls konfigurierbar.
  - Verwenden Sie Node.js-Debugging-Tools (z. B. `node --inspect`), wenn Sie serverseitigen Code schrittweise durchgehen müssen.

- **Probleme mit Tools:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuchen Sie, das Problem zu isolieren, indem Sie die einfachste mögliche Version des Befehls oder der Operation ausführen, die das Tool ausführt.
  - Prüfen Sie bei `run_shell_command` zunächst, ob der Befehl direkt in Ihrer Shell funktioniert.
  - Überprüfen Sie bei _Dateisystem-Tools_ die Pfade und die Berechtigungen.
- **Vorab-Prüfungen:**
  - Führen Sie immer `npm run preflight` aus, bevor Sie Code committen. Dies kann viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern erkennen.

## Vorhandene GitHub-Issues ähnlich zu Ihrem oder Erstellen neuer Issues

Wenn Sie auf ein Problem stoßen, das hier in diesem _Troubleshooting-Leitfaden_ nicht abgedeckt ist, sollten Sie den [Issue-Tracker auf GitHub](https://github.com/QwenLM/qwen-code/issues) von Qwen Code durchsuchen. Wenn Sie kein ähnliches Problem zu Ihrem finden, sollten Sie ein neues GitHub-Issue mit einer detaillierten Beschreibung erstellen. Pull-Requests sind ebenfalls willkommen!
