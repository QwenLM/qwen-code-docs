# Lokale Startvorlagen für `qwen serve` (v0.16-alpha)

Referenzvorlagen, um `qwen serve` als langlebigen Hintergrundprozess auf einer Entwickler-Workstation auszuführen. Ergänzt die [v0.16-alpha bekannten Einschränkungen](./qwen-serve.md#v016-alpha-known-limits) – lokal, Einzelbenutzer, BYO-Bearer-Token. Containerisierte/Multi-Host/TLS-Proxy-Bereitstellungen werden auf v0.16.x verschoben.

> **Zielgruppe**: Entwickler, die den Daemon über Neustarts hinweg laufen lassen möchten, mit dauerhafter Protokollierung und sauberem `restart-on-failure`-Verhalten. Wenn der Daemon nur für die Dauer einer einzigen Shell-Sitzung benötigt wird, reicht ein einfaches `qwen serve` (Vordergrund, Strg-C zum Beenden).

## Ein Bearer-Token generieren (einmalig)

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # benutzerverwaltet, KEIN eingebauter Pfad
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

Der Pfad/Dateiname kann frei gewählt werden; v0.16-alpha generiert oder sucht keine Token-Datei automatisch (verschoben auf v0.16.x). Siehe den Abschnitt [Authentifizierung](./qwen-serve.md#authentication) im Benutzerhandbuch für das kanonische BYO-Setup.

> **Binden Sie dieses `export` nur an die aktuelle Shell-Sitzung.** Fügen Sie es nicht in `~/.bashrc` / `~/.zshrc` ein – ein export auf Profilebene legt den Bearer-Token für jeden von dieser Shell gestarteten Prozess offen (IDE-Unterprozesse, Browser-Debugger, `npm`-Skripte aus anderen Projekten). Verwenden Sie für langlebige Setups die unten beschriebenen Mechanismen `EnvironmentFile=` (systemd) / `EnvironmentVariables` (launchd) – beide beschränken den Token auf den Daemon-Prozess.

Der Daemon liest den Bearer-Token entweder aus `--token <wert>` auf der CLI oder aus der Umgebungsvariable `QWEN_SERVER_TOKEN` (Leerzeichen werden in beiden Fällen entfernt). Der TypeScript SDK `DaemonClient`-Konstruktor fällt auf `QWEN_SERVER_TOKEN` zurück, wenn keine `token`-Option übergeben wird (PR 27 Fallback – Clients mit gesetzter Umgebungsvariable müssen den Wert nie durch ihr Skript schleusen).

Ein `export` auf Shell-Ebene deckt sowohl den Server-Start als auch die SDK-Client-Konstruktion ab (halten Sie es nur auf die Sitzung beschränkt, gemäß dem obigen Hinweis).

## Linux: systemd-Benutzer-Unit

> **Finden Sie zuerst Ihr `qwen`-Binary.** Der `ExecStart=` in der Unit-Datei muss einen **absoluten Pfad** enthalten – Dienstmanager lesen nicht das `PATH` Ihrer Shell. Führen Sie `which qwen` aus, um ihn zu finden. Häufige Orte: `/usr/local/bin/qwen` (Linuxbrew, manuelle Installationen), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Ersetzen Sie den tatsächlichen Pfad überall dort, wo die Vorlagen `/PFAD/ZU/qwen` zeigen.

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code-Daemon (Loopback-HTTP + SSE)
After=network.target

[Service]
Type=simple
# Ersetzen Sie durch Ihr Projekt; %h wird unter Benutzer-Units zu $HOME expandiert.
WorkingDirectory=%h/ihr-projekt
# Führen Sie `which qwen` aus, um den absoluten Pfad zu finden. systemd liest $PATH nicht.
ExecStart=/PFAD/ZU/qwen serve --hostname 127.0.0.1 --port 4170
# Lesen Sie den Bearer-Token aus einer chmod 600-Datei, anstatt ihn in der Unit
# inline zu setzen. `Environment=` würde den Token in der Unit-Datei offenlegen
# (normalerweise 644 = weltlesbar). EnvironmentFile hält den Token in der
# benutzereigenen Secret-Datei, die Sie bereits mit `chmod 600` erstellt haben.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Erstellen Sie die Umgebungsdatei einmalig (die Token-Datei aus dem Setup-Schritt enthält den rohen Wert; diese Datei verpackt ihn in `KEY=value`-Form, damit systemd sie als Umgebungszuweisung liest):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Verwaltung:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # Benutzer-Manager nach Abmeldung / über Neustart hinweg aktiv halten
journalctl --user -u qwen-serve -f               # Logs mitverfolgen
systemctl --user restart qwen-serve.service     # nach Token-Rotation
systemctl --user disable --now qwen-serve.service
```

Ohne `loginctl enable-linger` wird die systemd-Instanz auf Benutzerebene heruntergefahren, wenn sich der Benutzer abmeldet, und startet erst beim nächsten Login neu – auf einem headless Entwicklungsrechner würde der Daemon das Ende einer SSH-Sitzung nicht überleben. `enable-linger` ist das, was „über Neustarts hinweg“ tatsächlich funktionieren lässt.

**Systemweite Alternative** (gemeinsam genutzte Entwicklungsrechner, seltener): Legen Sie die Unit unter `/etc/systemd/system/qwen-serve@.service` mit `User=%i` ab, verwalten Sie sie via `sudo systemctl enable --now qwen-serve@<benutzername>.service`. Ansonsten gleicher `[Service]`-Rumpf – aber weltlesbare `Environment=`-Offenlegung ist auf dieser Ebene noch problematischer, verwenden Sie daher immer `EnvironmentFile=` mit Verweis auf die `chmod 600`-Datei des Benutzers. Wählen Sie für Einzelbenutzer-Workstations die Benutzerebene + linger.

## macOS: launchd-Benutzer-Agent

> **Finden Sie zuerst Ihr `qwen`-Binary.** Gleiche Einschränkung wie bei systemd – `ProgramArguments` muss einen **absoluten Pfad** enthalten. Führen Sie `which qwen` aus, um ihn zu finden. Häufige Orte auf macOS: `/opt/homebrew/bin/qwen` (Homebrew auf Apple Silicon), `/usr/local/bin/qwen` (Homebrew auf Intel, manuelle Installationen), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Ersetzen Sie unten, wo die Vorlage `/PFAD/ZU/qwen` zeigt.

`~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.qwenlm.qwen-serve</string>
  <key>ProgramArguments</key>
  <array>
    <!-- Führen Sie `which qwen` aus, um den absoluten Pfad zu finden; launchd liest $PATH nicht. -->
    <string>/PFAD/ZU/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd expandiert `~` oder `$HOME` NICHT – absolute Pfade verwenden. -->
  <key>WorkingDirectory</key>
  <string>/Users/IHR-BENUTZERNAME/ihr-projekt</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- COMMITEN Sie diese Datei NICHT mit einem echten Token. Setzen Sie außerdem chmod 600
         auf die plist selbst, damit der inline-Token nicht weltlesbar ist. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>TOKEN-HIER-EINFÜGEN</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Nur bei Nicht-Null-Exit neu starten (entspricht systemd Restart=on-failure).
       Ein bloßes `<true/>` würde auch nach einem sauberen SIGTERM neu starten, was
       `kill <pid>` als Stoppsignal unmöglich macht – der Bediener müsste
       stattdessen `launchctl unload` ausführen. SuccessfulExit=false behebt das. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Drosselt Neustart-Stürme bei dauerhaften Fehlern (entspricht systemd
       RestartSec=5; launchds Standard würde <1s neu starten). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Loggen in die Benutzer-Bibliothek, nicht nach /tmp. /tmp ist weltbeschreibbar
       (Symlink-Angriffsrisiko auf gemeinsam genutzten Workstations) und wird von
       periodic-daily nach 3 Tagen bereinigt; `~/Library/Logs/qwen-serve/` ist
       benutzerbezogen und überlebt. launchd kürzt diese bei jedem `load`,
       daher löscht der Unload→Load-Token-Rotationszyklus vorherige Diagnose-Logs –
       sichern Sie sie, wenn Sie eine Untersuchung nach einem Vorfall benötigen. -->
  <key>StandardOutPath</key>
  <string>/Users/IHR-BENUTZERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/IHR-BENUTZERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

Verwaltung:

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # nur beim ersten Mal
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist enthält den inline-Token
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # zum Stoppen
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

Nach einer Bearbeitung der plist (z. B. Token-Rotation) müssen Sie `unload` und dann `load` ausführen – `launchctl` lädt plist-Änderungen nicht automatisch neu wie `systemd daemon-reload`. Hinweis: Jedes `load` kürzt die Logdateien, also sichern Sie sie, wenn Sie vor der Rotation einen Vorfall untersuchen.

## tmux-Sitzung (interaktive Überwachung)

Setzt voraus, dass `QWEN_SERVER_TOKEN` bereits in Ihrer Shell exportiert ist (siehe Setup-Abschnitt oben):

```bash
tmux new -d -s qwen-serve "cd ~/ihr-projekt && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # Live-Logs anzeigen; Strg-b d zum Trennen
tmux kill-session -t qwen-serve
```

`tmux new -d` erbt die Umgebung der Eltern-Shell, sodass `QWEN_SERVER_TOKEN` automatisch durchfließt. Am besten geeignet, wenn Sie gelegentlich die stdout des Daemons (Auth-Warnungen, MCP-Erkennungsfortschritt, Warnungen zu langsamen Clients) sehen möchten, ohne sich auf eine Service-Unit festzulegen. Überlebt das Schließen des Terminals, aber nicht einen Host-Neustart.

## nohup-Einzeiler (schnell und schmutzig)

Setzt voraus, dass `QWEN_SERVER_TOKEN` bereits in Ihrer Shell exportiert ist:

```bash
nohup bash -c 'cd ~/ihr-projekt && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # Daemon-PID; merken, wenn Sie später sauber `kill` möchten
```

Das umschließende `bash -c '...'` stellt sicher, dass der Daemon an `~/ihr-projekt` gebunden wird und nicht dort, wo Sie den Befehl gerade ausgeführt haben. Ohne dieses `cd` verwendet `qwen serve` standardmäßig `process.cwd()` und ein `POST /session` von einem Client, der Ihren Projekt-Workspace erwartet, gibt `400 workspace_mismatch` zurück – eine stille Falle.

In Ordnung für einmalige „Lass mich das im Hintergrund laufen lassen, während ich an der API herumprobiere“-Workflows. **Nicht empfohlen** für alles, was über eine einzelne Sitzung hinausgeht – kein Neustart bei Absturz, Logdatei wächst unbegrenzt, keine saubere Möglichkeit, den Daemon zu finden, wenn Sie die PID vergessen haben. Bevorzugen Sie tmux für interaktive Überwachung oder systemd/launchd für alles, was einen Neustart überdauern soll.

## Überprüfen, ob der Daemon läuft

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # Feature-Set des Daemons
```

Wenn Auth konfiguriert ist (d. h. der Daemon wurde mit `--token` / gesetztem `QWEN_SERVER_TOKEN` gestartet, ODER `--require-auth=true`), benötigt jede Route außer `/health` auf Loopback `Authorization: Bearer <token>`. Wenn Sie den Daemon ohne Token auf dem Loopback-Standard gestartet haben (der `qwen serve`-Nullkonfigurationspfad), benötigt keiner der Aufrufe einen Header. Die obigen Vorlagen konfigurieren alle einen Token, daher wird der `Authorization`-Header in der Praxis benötigt. Wenn `/capabilities` `401` zurückgibt, stimmt der Token in der Unit/plist nicht mit dem in der Umgebung exportierten Token überein, den Ihr `curl` verwendet.

## Token-Rotation

1. Generieren Sie einen neuen Token + schreiben Sie die Umgebungsdatei, auf die die Unit verweist:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Für die launchd-/nohup-/tmux-Vorlagen: Bearbeiten Sie den `<string>`-Wert in der plist oder exportieren Sie `QWEN_SERVER_TOKEN` neu. Vergessen Sie nicht `chmod 600` auf die plist, wenn Sie sie neu generieren.)
2. Starten Sie den Daemon neu:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>` und dann mit dem neuen Token in der Umgebung neu ausführen
3. Aktualisieren Sie alle Client-SDKs/Skripte. Der TypeScript SDK `DaemonClient` liest `QWEN_SERVER_TOKEN` automatisch (PR 27 Fallback) – exportieren Sie den neuen Wert in jeder Client-Shell neu und erstellen Sie den Client neu.

## Neustart- und Absturzverhalten

Die Neustart-Semantik der Dienstmanager unterscheidet sich zwischen den Vorlagen:

- **systemd `Restart=on-failure`** – Neustart nur bei Nicht-Null-Exit/Signal. Ein sauberes SIGTERM (`systemctl stop`) löst **keine** Neustart-Schleife aus.
- **launchd `KeepAlive` mit `SuccessfulExit=false`** (obige Vorlage) – entspricht systemd-Verhalten. Ein bloßes `<true/>` hätte auch nach einem sauberen Exit neu gestartet. `ThrottleInterval=10` begrenzt die Rate von Neustart-Stürmen bei dauerhaften Fehlern, analog zu systemds `RestartSec=5`.
- **tmux / nohup** – kein automatischer Neustart. Ein Daemon-Absturz hinterlässt eine tote PID, bis Sie ihn neu starten.

Innerhalb der **Lebensdauer eines einzelnen Daemon-Prozesses** erholen sich Client-Trennungen über SSE-`Last-Event-ID`-Resume gemäß dem Abschnitt [Durabilitätsmodell](./qwen-serve.md#durability-model) im Benutzerhandbuch – der Wiedergabe-Ring befindet sich im Arbeitsspeicher.

Ein **Neustart** des Daemons verwirft alle In-Memory-Sitzungen; Clients verbinden sich neu und beginnen frisch. Die dauerhafte Speicherung von Sitzungsinhalten (Prompts, Tool-Aufrufe, Gesprächsverlauf) über Neustarts hinweg ist **NICHT** in v0.16-alpha.

## Außerhalb des Rahmens (verschoben auf v0.16.x oder später)

- **Containerisierte Bereitstellung** – Dockerfile, docker-compose, Kubernetes-Manifeste, nginx + TLS-Reverse-Proxy, Multi-Instanz-Token-Isolation. Verschiebt sich auf v0.16.x, sobald ein Enterprise-Pilot festgelegt ist; das Dokument würde sonst veralten, da es niemand validiert.
- **Hostübergreifende Föderation / Multi-Daemon-Koordination auf einem Host** – `1 Daemon = 1 Workspace × N Sitzungen` wird erzwungen. Token-Verknüpfung auf Instanzebene + Bereinigung alter Token verschiebt sich auf v0.16.x.
- **Automatisch generierte Daemon-Token** – Alpha ist BYO-Token. Auto-Gen + Token-Speicher-Infrastruktur verschiebt sich auf v0.16.x.
- **Windows-nativer Dienst** (`nssm`, Service Control Manager-Wrapper) – verwenden Sie vorerst [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) und folgen Sie dem obigen systemd-Abschnitt.

Siehe den Hinweis zu den [v0.16-alpha bekannten Einschränkungen](./qwen-serve.md#v016-alpha-known-limits) im Hauptbenutzerhandbuch für die vollständige Liste der verschobenen Funktionen und [#4175](https://github.com/QwenLM/qwen-code/issues/4175) für das v0.16-alpha-Rollout-Tracking-Issue.