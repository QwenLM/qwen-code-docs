# Lokale Vorlagen für `qwen serve` (v0.16-alpha)

Referenzvorlagen zum Ausführen von `qwen serve` als persistenten Hintergrundprozess auf einer Entwickler-Workstation. Passend zu den [bekannten Einschränkungen von v0.16-alpha](./qwen-serve.md#v016-alpha-known-limits) – nur lokal, Einzelbenutzer, BYO-Bearer-Token. Containerisierte / Multi-Host- / TLS-terminierte Bereitstellungen werden auf v0.16.x verschoben.

> **Zielgruppe**: Dogfooding-Entwickler, die den Daemon nach Neustarts laufen lassen wollen, mit dauerhafter Protokollierung und einer sauberen `Restart-on-Failure`-Strategie. Wenn Sie den Daemon nur für die Dauer einer einzelnen Shell-Sitzung benötigen, reicht einfaches `qwen serve` (Vordergrund, Strg-C zum Stoppen) aus.

## Einmalig: Bearer-Token generieren

```bash
openssl rand -hex 32 > ~/.qwen-serve-token  # benutzerverwaltet, KEIN eingebauter Pfad
chmod 600 ~/.qwen-serve-token
export QWEN_SERVER_TOKEN="$(cat ~/.qwen-serve-token)"
```

Pfad / Dateiname sind frei wählbar; v0.16-alpha generiert oder findet keine Token-Datei automatisch (verschoben auf v0.16.x). Siehe Abschnitt [Authentifizierung](./qwen-serve.md#authentication) im Benutzerhandbuch für die kanonische BYO-Einrichtung.

> **Beschränken Sie dieses `export` auf die aktuelle Shell-Sitzung.** Fügen Sie es nicht in `~/.bashrc` / `~/.zshrc` ein – ein export auf Profilebene legt das Bearer-Token für jeden Prozess offen, der von dieser Shell gestartet wird (IDE-Subprozesse, Browser-Debugger, `npm`-Skripte aus nicht verwandten Projekten). Verwenden Sie für langlebige Setups die weiter unten beschriebenen Mechanismen `EnvironmentFile=` (systemd) / `EnvironmentVariables` (launchd) – beide beschränken das Token auf den Daemon-Prozess.

Der Daemon liest das Bearer-Token entweder aus `--token <Wert>` in der CLI oder aus der Umgebungsvariablen `QWEN_SERVER_TOKEN` (Leerzeichen werden in beiden Fällen entfernt). Der `DaemonClient` des TypeScript SDK greift auf `QWEN_SERVER_TOKEN` zurück, wenn keine `token`-Option übergeben wird (Fallback von PR 27 – Clients mit gesetzter Umgebungsvariable müssen den Wert nie durch ihr Skript schleifen).

Ein `export` auf Shell-Ebene deckt sowohl den Serverstart als auch die SDK-Client-Konstruktion ab (bleiben Sie einfach auf die Sitzung beschränkt, wie oben erwähnt).

## Linux: systemd User-Unit

> **Finden Sie zuerst Ihr `qwen`-Binary.** Der `ExecStart=`-Eintrag der Unit-Datei muss einen **absoluten Pfad** enthalten – Service-Manager lesen nicht den `PATH` Ihrer Shell. Führen Sie `which qwen` aus, um es zu finden. Übliche Orte: `/usr/local/bin/qwen` (Linuxbrew, manuelle Installationen), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.fnm/aliases/default/bin/qwen` (fnm), `~/.volta/bin/qwen` (Volta). Ersetzen Sie den tatsächlichen Pfad überall dort, wo die Vorlagen unten `/PATH/TO/qwen` zeigen.

`~/.config/systemd/user/qwen-serve.service`:

```ini
[Unit]
Description=Qwen Code Daemon (Loopback HTTP + SSE)
After=network.target

[Service]
Type=simple
# Ersetzen Sie durch Ihr Projekt; %h wird bei User-Units zu $HOME expandiert.
WorkingDirectory=%h/your-project
# Führen Sie `which qwen` aus, um den absoluten Pfad zu finden. systemd liest NICHT $PATH.
ExecStart=/PATH/TO/qwen serve --hostname 127.0.0.1 --port 4170
# Lesen Sie das Bearer-Token aus einer chmod 600 Datei, anstatt es in der Unit
# direkt anzugeben. `Environment=` würde das Token in der Unit-Datei offenlegen
# (meist 644 = world-readable). EnvironmentFile behält das Token in der
# benutzereigenen geheimen Datei, die Sie bereits mit `chmod 600` erstellt haben.
EnvironmentFile=%h/.qwen-serve-token-env
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=default.target
```

Erstellen Sie die Env-Datei einmal (die Token-Datei aus dem Einrichtungsschritt enthält den Rohwert; dies verpackt ihn in `KEY=value`-Form, damit systemd es als Umgebungszuweisung liest):

```bash
echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
chmod 600 ~/.qwen-serve-token-env
```

Verwaltung:

```bash
systemctl --user daemon-reload
systemctl --user enable --now qwen-serve.service
loginctl enable-linger "$(whoami)"               # User-Manager nach Logout / über Neustarts hinweg aktiv halten
journalctl --user -u qwen-serve -f               # Logs verfolgen
systemctl --user restart qwen-serve.service     # nach Token-Rotation
systemctl --user disable --now qwen-serve.service
```

Ohne `loginctl enable-linger` wird die systemd-Instanz auf Benutzerebene beim Logout des Benutzers heruntergefahren und erst beim nächsten Login wieder gestartet – auf einem headless Dev-Rechner würde der Daemon das Ende einer SSH-Sitzung nicht überleben. `enable-linger` ist das, was "über Neustarts hinweg" tatsächlich ermöglicht.

**Systemweite Alternative** (gemeinsame Dev-Hosts, seltener): Legen Sie die Unit als `/etc/systemd/system/qwen-serve@.service` mit `User=%i` an, verwalten Sie sie mit `sudo systemctl enable --now qwen-serve@<benutzername>.service`. Ansonsten gleicher `[Service]`-Body – aber die Offenlegung von `Environment=` ist auf dieser Ebene noch problematischer, also verwenden Sie immer `EnvironmentFile=` mit Verweis auf die `chmod 600`-Datei des Benutzers. Wählen Sie User-Level + Linger für Single-User-Workstations.

## macOS: launchd User-Agent

> **Finden Sie zuerst Ihr `qwen`-Binary.** Gleiche Einschränkung wie bei systemd – `ProgramArguments` muss einen **absoluten Pfad** enthalten. Führen Sie `which qwen` aus, um es zu finden. Übliche Orte auf macOS: `/opt/homebrew/bin/qwen` (Homebrew auf Apple Silicon), `/usr/local/bin/qwen` (Homebrew auf Intel, manuelle Installationen), `~/.nvm/versions/node/vX.Y.Z/bin/qwen` (nvm), `~/.volta/bin/qwen` (Volta). Ersetzen Sie unten dort, wo die Vorlage `/PATH/TO/qwen` zeigt.
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
    <!-- Run `which qwen` to find the absolute path; launchd does NOT read $PATH. -->
    <string>/PATH/TO/qwen</string>
    <string>serve</string>
    <string>--hostname</string>
    <string>127.0.0.1</string>
    <string>--port</string>
    <string>4170</string>
  </array>
  <!-- launchd does NOT expand `~` or `$HOME` — use absolute paths. -->
  <key>WorkingDirectory</key>
  <string>/Users/YOUR-USERNAME/your-project</string>
  <key>EnvironmentVariables</key>
  <dict>
    <!-- DO NOT COMMIT this file with a real token. Also chmod 600 the
         plist itself so the inlined token is not world-readable. -->
    <key>QWEN_SERVER_TOKEN</key>
    <string>PASTE-YOUR-TOKEN-HERE</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <!-- Restart only on non-zero exits (matches systemd Restart=on-failure).
       A bare `<true/>` would respawn even after a clean SIGTERM, making
       `kill <pid>` impossible to use as a stop signal — operator would
       have to `launchctl unload`. SuccessfulExit=false fixes that. -->
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <!-- Throttle restart storms on persistent failures (mirrors systemd
       RestartSec=5; launchd's default would respawn every <1s). -->
  <key>ThrottleInterval</key>
  <integer>10</integer>
  <!-- Log into the user's Library, not /tmp. /tmp is world-writable
       (symlink-attack risk on shared workstations) and gets cleaned by
       periodic-daily after 3 days; `~/Library/Logs/qwen-serve/` is
       user-scoped and survives. launchd truncates these on every
       `load`, so the unload→load token-rotation cycle wipes prior
       diagnostic logs — back them up if you need post-incident
       inspection. -->
  <key>StandardOutPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/YOUR-USERNAME/Library/Logs/qwen-serve/err.log</string>
</dict>
</plist>
```

Verwaltung:

```bash
mkdir -p ~/Library/Logs/qwen-serve                                       # first time only
chmod 600 ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist             # plist holds the inline token
launchctl load   ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist
launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist      # to stop
tail -f ~/Library/Logs/qwen-serve/out.log ~/Library/Logs/qwen-serve/err.log
```

Nach dem Bearbeiten der plist (z. B. beim Rotieren des Tokens) müssen Sie ein `unload` und dann erneut `load` ausführen – `launchctl` lädt die Änderungen nicht automatisch neu wie `systemd daemon-reload`. Hinweis: Jeder `load`-Vorgang kürzt die Logdateien; sichern Sie sie daher vor einem Token-Wechsel, wenn Sie einen Vorfall untersuchen.

## tmux-Sitzung (interaktive Überwachung)

Vorausgesetzt, `QWEN_SERVER_TOKEN` ist bereits in Ihrer Shell exportiert (siehe Setup-Abschnitt oben):

```bash
tmux new -d -s qwen-serve "cd ~/your-project && qwen serve --hostname 127.0.0.1"
tmux attach -t qwen-serve   # live-Logs ansehen; Ctrl-b d zum Trennen
tmux kill-session -t qwen-serve
```

`tmux new -d` erbt die Umgebung der übergeordneten Shell, sodass `QWEN_SERVER_TOKEN` automatisch durchgereicht wird. Am besten geeignet, wenn Sie gelegentlich die stdout des Daemons (Auth-Warnungen, MCP-Erkennungsfortschritt, Langsam-Client-Warnungen) beobachten möchten, ohne einen Service-Eintrag zu erstellen. Überlebt das Schließen des Terminals, aber nicht einen Neustart des Rechners.

## nohup Einzeiler (schnell & schmutzig)

Vorausgesetzt, `QWEN_SERVER_TOKEN` ist bereits in Ihrer Shell exportiert:

```bash
nohup bash -c 'cd ~/your-project && qwen serve --hostname 127.0.0.1' > qwen-serve.log 2>&1 &
echo $!  # daemon PID; notieren falls Sie später sauber killen möchten
```

Das `bash -c '...'` stellt sicher, dass der Daemon im Verzeichnis `~/your-project` arbeitet und nicht dort, wo Sie den Befehl zufällig ausgeführt haben. Ohne dieses `cd` würde `qwen serve` auf `process.cwd()` zurückfallen, und ein `POST /session` von einem Client, der Ihren Projektordner erwartet, gibt `400 workspace_mismatch` zurück – eine stille Falle.

Geeignet für einmalige "Lass mich das im Hintergrund laufen lassen, während ich an der API herumspiele"-Workflows. **Nicht empfohlen** für mehr als eine einzige Sitzung – kein Neustart bei Abstürzen, Logdatei wächst unbegrenzt, keine saubere Möglichkeit den Daemon zu finden, wenn die PID vergessen wurde. Bevorzugen Sie tmux für die interaktive Überwachung oder systemd / launchd für alles, was einen Neustart überdauern soll.

## Überprüfen, ob der Daemon läuft

```bash
curl http://127.0.0.1:4170/health                                   # → {"status":"ok"}
curl -H "Authorization: Bearer $QWEN_SERVER_TOKEN" \
  http://127.0.0.1:4170/capabilities | jq .protocolVersions         # Funktionsumfang des Daemons
```

Wenn die Authentifizierung konfiguriert ist (d. h. der Daemon wurde mit `--token` / `QWEN_SERVER_TOKEN` gestartet ODER `--require-auth=true` ist gesetzt), benötigt jede Route außer `/health` auf dem Loopback einen `Authorization: Bearer <token>`-Header. Wenn Sie den Daemon ohne Token auf dem Loopback-Standard (der `qwen serve`-Zero-Config-Pfad) gestartet haben, ist für beide Aufrufe kein Header erforderlich. Die obigen Vorlagen konfigurieren alle einen Token, daher wird der `Authorization`-Header in der Praxis benötigt. Wenn `/capabilities` `401` zurückgibt, stimmt der Token in der Unit/plist nicht mit dem in der Umgebung exportierten Token überein, den Ihr `curl` verwendet.
## Token-Rotation

1. Generieren Sie einen neuen Token + schreiben Sie die env-Datei, auf die die Unit verweist:
   ```bash
   openssl rand -hex 32 > ~/.qwen-serve-token
   chmod 600 ~/.qwen-serve-token
   echo "QWEN_SERVER_TOKEN=$(cat ~/.qwen-serve-token)" > ~/.qwen-serve-token-env
   chmod 600 ~/.qwen-serve-token-env
   ```
   (Für die launchd-/nohup-/tmux-Vorlagen: Bearbeiten Sie den `<string>`-Wert der plist oder führen Sie `export QWEN_SERVER_TOKEN` erneut aus. Vergessen Sie nicht `chmod 600` auf der plist, wenn Sie sie neu erstellen.)
2. Starten Sie den Daemon neu:
   - **systemd**: `systemctl --user restart qwen-serve.service`
   - **launchd**: `launchctl unload ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist && launchctl load ~/Library/LaunchAgents/com.qwenlm.qwen-serve.plist`
   - **tmux / nohup**: `kill <pid>` und dann erneut mit dem neuen Token in der Umgebungsvariable ausführen
3. Aktualisieren Sie alle Client-SDKs/Skripte. Das TypeScript-SDK von `DaemonClient` liest `QWEN_SERVER_TOKEN` automatisch (PR 27 Fallback) — exportieren Sie den neuen Wert in jeder Client-Shell erneut und konstruieren Sie den Client neu.

## Neustart- und Absturzverhalten

Die Neustartsemantik der Service-Manager unterscheidet sich je nach Vorlage:

- **systemd `Restart=on-failure`** — Neustart nur bei Exit-Code ungleich 0 oder Signal. Ein sauberer SIGTERM (`systemctl stop`) löst **keine** Neustart-Schleife aus.
- **launchd `KeepAlive` mit `SuccessfulExit=false`** (die Vorlage oben) — entspricht dem systemd-Verhalten. Ein bloßes `<true/>` hätte auch nach einem sauberen Exit einen Neustart ausgelöst. `ThrottleInterval=10` begrenzt die Rate von Neustart-Stürmen bei dauerhaften Fehlern und spiegelt systemds `RestartSec=5` wider.
- **tmux / nohup** — kein automatischer Neustart. Ein Daemon-Absturz hinterlässt eine tote PID, bis Sie ihn erneut ausführen.

Innerhalb einer **einzelnen Daemon-Prozesslebensdauer** werden Client-Trennungen durch SSE `Last-Event-ID`-Resume gemäß dem Abschnitt [Durability model](./qwen-serve.md#durability-model) des Benutzerhandbuchs behoben — der Replay-Ring befindet sich im Arbeitsspeicher.

Ein Daemon-**Neustart** verwirft alle In-Memory-Sitzungen; Clients verbinden sich neu und beginnen frisch. Die sitzungsübergreifende Haltbarkeit von Sitzungsinhalten (Prompts, Tool-Aufrufe, Gesprächsverlauf) ist **NICHT** in v0.16-alpha.

## Nicht im Umfang (verschoben auf v0.16.x oder später)

- **Containerisierter Einsatz** — Dockerfile, docker-compose, Kubernetes-Manifeste, nginx + TLS-Reverse-Proxy, Multi-Instance-Token-Isolation. Wird auf v0.16.x verschoben, sobald ein Enterprise-Pilot feststeht; die Dokumentation würde sonst veralten, da sie niemand validiert.
- **Hostübergreifende Föderation / Multi-Daemon-Koordination auf einem Host** — `1 Daemon = 1 Workspace × N Sitzungen` wird erzwungen. Instanzpfad-basierte Token-Schlüsselung + Bereinigung abgelaufener Token werden auf v0.16.x verschoben.
- **Automatisch generierte Daemon-Tokens** — Alpha ist BYO-Token. Auto-Gen + Token-Store-Infrastruktur wird auf v0.16.x verschoben.
- **Windows-nativer Dienst** (`nssm`, Service Control Manager-Wrapper) — verwenden Sie vorerst [WSL2](https://learn.microsoft.com/en-us/windows/wsl/) und folgen Sie dem obigen systemd-Abschnitt.

Siehe den Hinweis [v0.16-alpha bekannte Grenzen](./qwen-serve.md#v016-alpha-known-limits) im Hauptbenutzerhandbuch für die vollständige Liste der zurückgestellten Funktionen und [#4175](https://github.com/QwenLM/qwen-code/issues/4175) für das Tracking-Issue zum Rollout von v0.16-alpha.
