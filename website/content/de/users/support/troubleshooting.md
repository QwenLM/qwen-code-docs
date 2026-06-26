# Fehlerbehebung

Diese Anleitung bietet Lösungen für häufige Probleme und Debugging-Tipps, einschließlich Themen zu:

- Authentifizierungs- oder Anmeldefehler
- Häufig gestellte Fragen (FAQs)
- Debugging-Tipps
- Bestehende GitHub Issues, die Ihrem ähneln, oder Erstellen neuer Issues

## Authentifizierungs- oder Anmeldefehler

- **Fehler: `Qwen OAuth free tier was discontinued on 2026-04-15`**
  - **Ursache:** Qwen OAuth ist seit dem 15. April 2026 nicht mehr verfügbar.
  - **Lösung:** Wechseln Sie zu einer anderen Authentifizierungsmethode. Führen Sie `qwen` → `/auth` aus und wählen Sie eine der folgenden Optionen:
    - **API-Key**: Verwenden Sie einen API-Key von Alibaba Cloud Model Studio ([Peking](https://bailian.console.aliyun.com/) / [intl](https://modelstudio.console.alibabacloud.com/)). Siehe die API-Einrichtungsanleitung ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=doc#/doc/?type=model&url=3023091) / [intl](https://modelstudio.console.alibabacloud.com/ap-southeast-1?tab=doc#/doc/?type=model&url=2974721)).
    - **Alibaba Cloud Coding Plan**: Abonnieren Sie einen festen monatlichen Betrag mit höheren Kontingenten. Siehe die Coding-Plan-Anleitung ([Peking](https://bailian.console.aliyun.com/cn-beijing/?tab=coding-plan#/efm/coding-plan-index) / [intl](https://modelstudio.console.alibabacloud.com/?tab=coding-plan#/efm/coding-plan-index)).

- **Fehler: `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`, `UNABLE_TO_VERIFY_LEAF_SIGNATURE` oder `unable to get local issuer certificate`**
  - **Ursache:** Möglicherweise befinden Sie sich in einem Firmennetzwerk mit einer Firewall, die SSL/TLS-Verkehr abfängt und inspiziert. Dies erfordert oft, dass ein benutzerdefiniertes Root-CA-Zertifikat von Node.js als vertrauenswürdig eingestuft wird.
  - **Lösung:** Setzen Sie die Umgebungsvariable `NODE_EXTRA_CA_CERTS` auf den absoluten Pfad Ihrer firmeneigenen Root-CA-Zertifikatsdatei.
    - Beispiel: `export NODE_EXTRA_CA_CERTS=/pfad/zu/ihrem/corporate-ca.crt`

- **Fehler: `Device authorization flow failed: fetch failed`**
  - **Ursache:** Node.js konnte die Qwen OAuth-Endpunkte nicht erreichen (häufig ein Proxy- oder SSL/TLS-Vertrauensproblem). Wenn verfügbar, gibt Qwen Code auch die zugrunde liegende Fehlerursache aus (z. B. `UNABLE_TO_VERIFY_LEAF_SIGNATURE`). Hinweis: Dieser Fehler ist spezifisch für den alten Qwen OAuth-Ablauf.
  - **Lösung:**
    - Wenn Sie noch Qwen OAuth verwenden, wechseln Sie über `/auth` zu API-Key oder Coding Plan.
    - Wenn Sie hinter einem Proxy sind, konfigurieren Sie diesen über `qwen --proxy <url>` (oder die `proxy`-Einstellung in `settings.json`).
    - Wenn Ihr Netzwerk ein firmeneigenes TLS-Inspektions-CA verwendet, setzen Sie `NODE_EXTRA_CA_CERTS` wie oben beschrieben.

- **Problem: Keine Anzeige der Benutzeroberfläche nach Authentifizierungsfehler**
  - **Ursache:** Wenn die Authentifizierung nach Auswahl eines Authentifizierungstyps fehlschlägt, kann die Einstellung `security.auth.selectedType` in `settings.json` gespeichert bleiben. Beim Neustart kann die CLI beim Versuch, sich mit dem fehlgeschlagenen Authentifizierungstyp zu authentifizieren, hängen bleiben und die UI nicht anzeigen.
  - **Lösung:** Löschen Sie den Konfigurationseintrag `security.auth.selectedType` in Ihrer `settings.json`-Datei:
    - Öffnen Sie `~/.qwen/settings.json` (oder `./.qwen/settings.json` für projektspezifische Einstellungen)
    - Entfernen Sie das Feld `security.auth.selectedType`
    - Starten Sie die CLI neu, um die Authentifizierung erneut anzufordern

## Häufig gestellte Fragen (FAQs)

- **F: Wie aktualisiere ich Qwen Code auf die neueste Version?**
  - A: Wenn Sie Qwen Code mit dem eigenständigen Installationsprogramm installiert haben, führen Sie den eigenständigen Installationsbefehl erneut aus. Wenn Sie es global über `npm` installiert haben, aktualisieren Sie es mit dem Befehl `npm install -g @qwen-code/qwen-code@latest`. Wenn Sie es aus dem Quellcode kompiliert haben, ziehen Sie die neuesten Änderungen aus dem Repository und bauen Sie es mit dem Befehl `npm run build` neu.

- **F: Wo werden die Konfigurations- oder Einstellungsdateien von Qwen Code gespeichert?**
  - A: Die Qwen Code-Konfiguration wird in zwei `settings.json`-Dateien gespeichert:
    1. In Ihrem Home-Verzeichnis: `~/.qwen/settings.json`.
    2. Im Stammverzeichnis Ihres Projekts: `./.qwen/settings.json`.

    Weitere Informationen finden Sie unter [Qwen Code-Konfiguration](../configuration/settings).

- **F: Warum sehe ich keine zwischengespeicherten Token-Anzahlen in meiner Statistikausgabe?**
  - A: Informationen zu zwischengespeicherten Token (Cached Tokens) werden nur angezeigt, wenn zwischengespeicherte Token verwendet werden. Diese Funktion steht API-Key-Benutzern zur Verfügung (z. B. Alibaba Cloud Model Studio API-Key oder Google Cloud Vertex AI). Sie können Ihren gesamten Token-Verbrauch weiterhin mit dem Befehl `/stats` anzeigen.

## Häufige Fehlermeldungen und Lösungen

- **Fehler: `EADDRINUSE` (Adresse bereits verwendet) beim Starten eines MCP-Servers.**
  - **Ursache:** Ein anderer Prozess verwendet bereits den Port, an den sich der MCP-Server binden möchte.
  - **Lösung:**
    Stoppen Sie entweder den anderen Prozess, der den Port verwendet, oder konfigurieren Sie den MCP-Server so, dass er einen anderen Port verwendet.

- **Fehler: Befehl nicht gefunden (beim Versuch, Qwen Code mit `qwen` auszuführen).**
  - **Ursache:** Die CLI ist nicht korrekt installiert oder befindet sich nicht im `PATH` Ihres Systems.
  - **Lösung:**
    Die Aktualisierung hängt davon ab, wie Sie Qwen Code installiert haben:
    - Wenn Sie `qwen` mit dem eigenständigen Installationsprogramm installiert haben, führen Sie den eigenständigen Installationsbefehl erneut aus und öffnen Sie dann ein neues Terminal.
    - Wenn Sie `qwen` global installiert haben, überprüfen Sie, ob das globale `npm`-Binärverzeichnis in Ihrem `PATH` ist. Sie können mit dem Befehl `npm install -g @qwen-code/qwen-code@latest` aktualisieren.
    - Wenn Sie `qwen` aus dem Quellcode ausführen, stellen Sie sicher, dass Sie den richtigen Befehl zum Aufrufen verwenden (z. B. `node packages/cli/dist/index.js ...`). Um zu aktualisieren, ziehen Sie die neuesten Änderungen aus dem Repository und bauen Sie es mit dem Befehl `npm run build` neu.

- **Fehler: `MODULE_NOT_FOUND` oder Importfehler.**
  - **Ursache:** Abhängigkeiten sind nicht korrekt installiert oder das Projekt wurde nicht gebaut.
  - **Lösung:**
    1. Führen Sie `npm install` aus, um sicherzustellen, dass alle Abhängigkeiten vorhanden sind.
    2. Führen Sie `npm run build` aus, um das Projekt zu kompilieren.
    3. Überprüfen Sie mit `npm run start`, ob der Build erfolgreich abgeschlossen wurde.

- **Fehler: „Operation not permitted“, „Permission denied“ oder ähnliches.**
  - **Ursache:** Wenn die Sandbox aktiviert ist, kann Qwen Code versuchen, Vorgänge auszuführen, die durch die Sandbox-Konfiguration eingeschränkt sind, z. B. Schreiben außerhalb des Projektverzeichnisses oder des System-Temp-Verzeichnisses.
  - **Lösung:** Weitere Informationen finden Sie in der Dokumentation [Konfiguration: Sandboxing](../features/sandbox), einschließlich der Anpassung Ihrer Sandbox-Konfiguration.

- **Qwen Code läuft in „CI“-Umgebungen nicht im interaktiven Modus**
  - **Problem:** Qwen Code startet nicht im interaktiven Modus (keine Eingabeaufforderung), wenn eine Umgebungsvariable gesetzt ist, die mit `CI_` beginnt (z. B. `CI_TOKEN`). Dies liegt daran, dass das Paket `is-in-ci`, das vom zugrunde liegenden UI-Framework verwendet wird, diese Variablen erkennt und von einer nicht interaktiven CI-Umgebung ausgeht.
  - **Ursache:** Das Paket `is-in-ci` prüft auf das Vorhandensein von `CI`, `CONTINUOUS_INTEGRATION` oder einer beliebigen Umgebungsvariable mit dem Präfix `CI_`. Wenn eine dieser Variablen gefunden wird, signalisiert dies, dass die Umgebung nicht interaktiv ist, was verhindert, dass die CLI im interaktiven Modus startet.
  - **Lösung:** Wenn die mit `CI_` beginnende Variable für die Funktion der CLI nicht benötigt wird, können Sie sie vorübergehend für den Befehl entfernen, z. B. `env -u CI_TOKEN qwen`.

- **DEBUG-Modus funktioniert nicht aus der projektbezogenen .env-Datei**
  - **Problem:** Das Setzen von `DEBUG=true` in einer `.env`-Datei des Projekts aktiviert den Debug-Modus für die CLI nicht.
  - **Ursache:** Die Variablen `DEBUG` und `DEBUG_MODE` werden automatisch aus projektbezogenen `.env`-Dateien ausgeschlossen, um Störungen des CLI-Verhaltens zu verhindern.
  - **Lösung:** Verwenden Sie stattdessen eine `.qwen/.env`-Datei oder konfigurieren Sie die Einstellung `advanced.excludedEnvVars` in Ihrer `settings.json`, um weniger Variablen auszuschließen.

- **Trackpad-Scrolling in tmux ändert die Eingabehistorie anstatt die Konversation zu scrollen**
  - **Problem:** In einer tmux-Sitzung kann das Scrollen mit dem Trackpad oder Mausrad durch vorherige Eingabeaufforderungen blättern, ähnlich wie die Pfeiltasten `Nach oben` oder `Nach unten`.
  - **Ursache:** tmux kann Mausrad-Gesten in einfache Pfeiltastenfolgen übersetzen. Diese Folgen sind für qwen-code nicht von echten Pfeiltastenanschlägen zu unterscheiden.
  - **Lösung:** Aktivieren Sie `ui.useTerminalBuffer`; verwenden Sie dann `Shift+Nach oben` / `Shift+Nach unten` oder das Mausrad, wenn tmux Radereignisse an die App weiterleitet. Wenn Sie das Host-Scrollback bevorzugen, passen Sie Ihre tmux-Mausbindungen für Radereignisse an.

## IDE Companion stellt keine Verbindung her

- Stellen Sie sicher, dass VS Code einen einzelnen Workspace-Ordner geöffnet hat.
- Starten Sie das integrierte Terminal nach der Installation der Erweiterung neu, damit es Folgendes übernimmt:
  - `QWEN_CODE_IDE_WORKSPACE_PATH`
  - `QWEN_CODE_IDE_SERVER_PORT`
- Wenn Sie in einem Container arbeiten, überprüfen Sie, ob `host.docker.internal` aufgelöst werden kann. Andernfalls ordnen Sie den Host entsprechend zu.
- Installieren Sie den Companion mit `/ide install` neu und verwenden Sie „Qwen Code: Ausführen“ in der Befehlspalette, um zu überprüfen, ob er startet.

## Exit-Codes

Qwen Code verwendet spezifische Exit-Codes, um den Grund für die Beendigung anzugeben. Dies ist besonders nützlich für Skripterstellung und Automatisierung.

| Exit-Code | Fehlertyp                   | Beschreibung                                                                                         |
| --------- | --------------------------- | ---------------------------------------------------------------------------------------------------- |
| 41        | `FatalAuthenticationError`  | Während des Authentifizierungsvorgangs ist ein Fehler aufgetreten.                                   |
| 42        | `FatalInputError`           | Der CLI wurden ungültige oder fehlende Eingaben bereitgestellt. (Nur im nicht interaktiven Modus)   |
| 44        | `FatalSandboxError`         | Es ist ein Fehler in der Sandbox-Umgebung aufgetreten (z. B. Docker, Podman oder Seatbelt).         |
| 52        | `FatalConfigError`          | Eine Konfigurationsdatei (`settings.json`) ist ungültig oder enthält Fehler.                         |
| 53        | `FatalTurnLimitedError`     | Die maximale Anzahl an Gesprächsrunden für die Sitzung wurde erreicht. (Nur im nicht interaktiven Modus) |

## Debugging-Tipps

- **CLI-Debugging:**
  - Verwenden Sie das Flag `--verbose` (falls verfügbar) mit CLI-Befehlen für detailliertere Ausgaben.
  - Überprüfen Sie die CLI-Protokolle, die sich oft in einem benutzerspezifischen Konfigurations- oder Cache-Verzeichnis befinden.
- **Core-Debugging:**
  - Überprüfen Sie die Server-Konsolenausgabe auf Fehlermeldungen oder Stack-Traces.
  - Erhöhen Sie die Protokollausführlichkeit, falls konfigurierbar.
  - Verwenden Sie Node.js-Debugging-Tools (z. B. `node --inspect`), wenn Sie serverseitigen Code schrittweise durchgehen müssen.
- **Tool-Probleme:**
  - Wenn ein bestimmtes Tool fehlschlägt, versuchen Sie, das Problem zu isolieren, indem Sie die einfachste mögliche Version des Befehls oder Vorgangs ausführen, den das Tool ausführt.
  - Überprüfen Sie bei `run_shell_command` zuerst, ob der Befehl direkt in Ihrer Shell funktioniert.
  - Überprüfen Sie bei _Dateisystem-Tools_ die Pfade und die Berechtigungen.
- **Preflight-Checks:**
  - Führen Sie vor dem Commit von Code immer `npm run preflight` aus. Dies kann viele häufige Probleme im Zusammenhang mit Formatierung, Linting und Typfehlern erkennen.

## Bestehende GitHub Issues, die Ihrem ähneln, oder Erstellen neuer Issues

Wenn Sie auf ein Problem stoßen, das hier in diesem _Troubleshooting-Leitfaden_ nicht behandelt wurde, suchen Sie im Qwen Code [Issue-Tracker auf GitHub](https://github.com/QwenLM/qwen-code/issues). Wenn Sie kein ähnliches Issue finden können, erwägen Sie, ein neues GitHub Issue mit einer detaillierten Beschreibung zu erstellen. Pull-Requests sind ebenfalls willkommen!