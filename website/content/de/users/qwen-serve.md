# Daemon-Modus (`qwen serve`)

Führen Sie Qwen Code als HTTP-Daemon aus, damit mehrere Clients (IDE-Plugins, Web-UIs, CI-Skripte, benutzerdefinierte CLIs) Agentensitzungen über HTTP + Server-Sent Events teilen können, anstatt dass jeder seinen eigenen Subprozess startet.

> **Status:** Experimentell. Der Daemon unterstützt lokale und Remote-Bereitstellungen von Web Shell/API. Überprüfen Sie [Authentication](#authentication) und das [deployment threat model](#default-deployment-threat-model), bevor Sie ihn über Loopback hinaus freigeben.

## Was es dir bietet

- **Integrierte Web-Shell-UI** — `qwen serve` stellt die browserbasierte Web-Shell standardmäßig unter seiner Root-URL (`http://127.0.0.1:4170/`) bereit; starte `qwen serve --open`, um sie automatisch im Browser zu öffnen. Sie wird auf derselben Origin wie die API ausgeliefert, sodass kein zweiter Port oder Reverse-Proxy benötigt wird. Übergib `--no-web` für einen reinen API-Daemon.

  Die Seitenleiste blendet **No-workspace sessions** aus, sobald die Liste ohne Sitzungen geladen wurde, genau wie **Pinned**. Verwenden Sie die Haupt-Schaltfläche **New session** und wählen Sie im Composer **No workspace**, um ein Gespräch zu starten, wenn die Gruppe ausgeblendet ist.

- **Bis zu ein primäres ACP-Child plus ein On-Demand-Child pro vertrauenswürdigem Secondary, viele Clients** — Production versucht, die primäre Bridge vorzuwärmen und wiederholt den ersten Versuch nach einem Fehlschlag; vertrauenswürdige Secondary-Runtimes starten ihr eigenes Child bei Bedarf, während nicht vertrauenswürdige Secondaries niemals eines starten. Unter dem Standard-`sessionScope: 'single'` teilen sich Clients, die auf denselben Workspace abzielen, eine ACP-Sitzung und arbeiten an derselben Konversation, denselben Datei-Diffs und denselben Permission-Prompts zusammen.
- **Reconnect-sicheres Streaming** — SSE mit `Last-Event-ID` Reconnect ermöglicht es einem Client, die Verbindung zu trennen und exakt dort wieder aufzunehmen, wo er aufgehört hat (innerhalb des Replay-Fensters des Rings).
- **Paginierte persistierte Transkripte** — `GET /session/:id/transcript` gibt das vollständige aktive persistierte Transkript als Replay-Seiten zurück, ohne einen Client anzuhängen oder das Live-SSE-Replay-Fenster zu verändern.
- **First-Responder-Permissions** — wenn der Agent die Erlaubnis anfordert, ein Tool auszuführen, sieht jeder verbundene Client die Anfrage; der Client, der zuerst antwortet, erhält den Zuschlag.
- **Ein Daemon, ein oder mehrere Workspaces** — wiederhole `--workspace`, um isolierte Workspace-Runtimes unter einem Listener zu registrieren. Der erste Workspace ist primär und bleibt der Standard für Anfragen, die `cwd` weglassen.
- **Experimentelle, daemon-verwaltete Channels** — starte mit `qwen serve --channel <name>`, oder starte ohne Channel und wähle später einen mit `qwen channel set`. Worker sind separate Prozesse, die vom Daemon-Lifecycle besessen werden. Ihre Auswahl kann abgefragt, ersetzt, neu geladen und gestoppt werden, ohne den Daemon neu zu starten.
- **Remote-Runtime-Steuerung** — ändere den Approval-Modus einer Sitzung (`POST /session/:id/approval-mode`), schalte ein Tool (`POST /workspace/tools/:name/enable`) oder einen geladenen Skill (`POST /workspace/skills/:name/enable`) pro Workspace um, erstelle eine leere `QWEN.md` (`POST /workspace/init`, nur mechanisch — ruft NICHT das Modell auf; für KI-Befüllung folge mit `POST /session/:id/prompt`), starte einen einzelnen MCP-Server mit einer Budget-Vorabprüfung neu (`POST /workspace/mcp/:server/restart`) oder füge MCP-Server zur Laufzeit hinzu/entferne sie ohne Daemon-Neustart (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`). Der Standard-Loopback-Listener ohne Token kann alle davon nutzen; die strikten Workspace-Mutationen erfordern in anderen Deployment-Modi zusätzlich Operator-Credentials.
- **Session-Recap** ([#4175](https://github.com/QwenLM/qwen-code/issues/4175) Follow-up) — rufe eine einzeilige "Wo habe ich aufgehört"-Zusammenfassung einer aktiven Sitzung ab (`POST /session/:id/recap`). Wrapper für `generateSessionRecap` aus dem Core als Side-Query gegen das schnelle Modell; verunreinigt weder den Haupt-Chat-Verlauf noch den SSE-Stream. Non-strict Gate (gleiche Haltung wie `/prompt`); SDK-Helper `client.recapSession(sessionId)`.
  - **Bekannte Einschränkung — Token-Kosten-Verstärkung:** Die Route ist ein reiner Kosten-Endpunkt (jeder Aufruf ist eine LLM-Side-Query, kein State-Nutzen) und der Daemon hat in v1 kein Rate-Limit pro Route. Auf einem No-Token-Loopback-Default kann ein fehlerhafter oder bösartiger lokaler Client sie spammen, um Token zu verbrennen. Konfiguriere `--token` (und optional `--require-auth`) auf gemeinsamen Dev-Hosts, bevor du den Daemon freigibst.
  - **Sicherheit bei gleichzeitigen Recaps:** Zwei gleichzeitige `/recap`-Aufrufe auf derselben Sitzung führen zwei unabhängige Side-Queries aus. `generateSessionRecap` liest einen Snapshot des Chat-Verlaufs über `GeminiClient.getChat().getHistory()` und füttert ihn an einen separaten `BaseLlmClient.generateText`-Aufruf (via `runSideQuery`); es hängt nichts an oder mutiert das `GeminiChat` der Sitzung. Kann sicher von mehreren Clients ohne Koordination aufgerufen werden.

## Hinweise zur Bereitstellung und Sicherheit [#deployment-and-security-notes]

- **Loopback ist standardmäßig vertrauenswürdig** — `127.0.0.1:4170` startet ohne Bearer-Authentifizierung, und jeder lokale Prozess, der es erreichen kann, erhält volle API-Autorität, einschließlich Codeausführung als Daemon-Benutzer. Verwenden Sie ein stabiles `QWEN_SERVER_TOKEN` mit `--require-auth` auf gemeinsamen oder nicht vertrauenswürdigen Hosts.
- **Nicht-Loopback-Listener verwenden immer ein Bearer-Token** — stellen Sie Ihr eigenes Token bereit oder verwenden Sie das ephemere Token, das beim Start ausgegeben wird. Generierte Tokens rotieren bei Neustart, daher benötigen wiederverwendbare Clients ein stabiles Token. HTTP ist unverschlüsselt; konfigurieren Sie TLS, bevor Sie nicht vertrauenswürdige Netzwerke durchqueren.
- **Der Hintergrundstart hat zwei Pfade** — verwenden Sie `qwen daemon start` für die integrierte lokale Lifecycle-Verwaltung oder die [systemd / launchd / tmux / nohup templates](./qwen-serve-deploy-local.md), wenn Sie eine Service-Manager-Überwachung oder einen Start nach dem Neustart benötigen.
- **Token-Persistenz ist opt-in** — `qwen daemon start --save-token` speichert ein explizit bereitgestelltes Bearer-Token in einer nur vom Besitzer lesbaren Sidecar-Datei für `qwen daemon token`; normale `qwen serve` und generierte Tokens verwenden diese Sidecar-Datei nicht. Siehe [Inspect and control a local daemon](#inspect-and-control-a-local-daemon).
- **Multi-Workspace ist Single-Operator** — registrierte Workspaces teilen sich das Bearer-Token, den Listener, die Quotas und die Prozessfehlergrenze des Daemons. Verwenden Sie separate Daemons und einen externen Orchestrator für unabhängige Benutzer oder Sicherheitsprinzipale; siehe [Multi-session & multi-workspace deployment](#multi-session--multi-workspace-deployment).

Für die tiefere Aufzählung von "was wir in Stage 1 nicht beheben" (Single-Host-Session-State-Mutationsmodell + N-parallele-Sitzungen, die sich ein ACP-Child teilen), siehe [Stage 1 scope boundaries](#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15) weiter unten.

## Schnellstart

### Remote Web Shell und Telefonzugriff [#remote-web-shell-and-phone-access]

Um sich von einem anderen Rechner mit einem laufenden lokalen Daemon zu verbinden, öffnen Sie dessen Web Shell und navigieren Sie zu **Einstellungen → Verbindungen → Remote-Verbindungen zulassen**. Der Fernzugriff ist standardmäßig deaktiviert. Aktivieren Sie ihn, wählen Sie bei Aufforderung eine Netzwerkschnittstelle aus und kopieren Sie die angezeigte Adresse und das Bearer-Token in das Verbindungsformular der anderen Web Shell. Ein zusätzlicher Terminalbefehl oder ein Neustart des Daemons ist nicht erforderlich.

Der Remote-Listener bedient dieselben Arbeitsbereiche und Sitzungen wie der lokale Listener. Er verwendet zunächst denselben numerischen Port auf der ausgewählten Schnittstelle. Falls diese Adresse belegt ist, wählen Sie einen anderen Port in den erweiterten Einstellungen; Qwen ändert Ports nicht stillschweigend und stoppt keine anderen Dienste. HTTP-Seiten auf `localhost` und `127.0.0.1` sind auf jedem Port erlaubt. Die erweiterten Einstellungen akzeptieren zusätzliche exakte Browser-Origin, einschließlich HTTPS-Seiten.

Das Deaktivieren des Zugriffs oder das Zurücksetzen des Tokens widerruft bestehende Remote-Verbindungen; lokale Clients und vom Daemon verwaltete laufende Aufgaben werden fortgesetzt. Durch erneutes Aktivieren wird ein neues Token generiert. Die Einstellung bleibt über Daemon-Neustarts hinweg nicht erhalten. Das Token ist nur für den autorisierten lokalen Operator verfügbar. Ein primärer Listener, der bereits durch explizite Start-/Proxy-Konfiguration exponiert wurde, wird separat gekennzeichnet und durch diesen Schalter nicht geschlossen.

Die Adresse muss über das Netzwerk und die Firewall erreichbar sein. HTTP verschlüsselt das Token nicht; verwenden Sie ein vertrauenswürdiges Netzwerk oder konfigurieren Sie HTTPS. Eine HTTPS-Seite kann keine Verbindung zu einem Remote-HTTP-Endpunkt herstellen. Die UI unterscheidet zwischen Authentifizierungs-, Richtlinien- und Mixed-Content-Fehlern; ein allgemeiner Netzwerkfehler im Browser kann CORS-, Zertifikats- und Konnektivitätsfehler nicht zuverlässig unterscheiden.

```bash
qwen serve --hostname 0.0.0.0
```

Wenn weder `--token` noch `QWEN_SERVER_TOKEN` angegeben wird, generiert ein Non-Loopback-Listener ein 128-Bit-ephemeres Bearer-Token (22 URL-sichere Zeichen) und gibt es einmalig beim Start aus. Explizite Flag-Werte haben Vorrang vor der Umgebung; bei einem Non-Loopback-Bind verweigert ein explizit leerer Wert weiterhin fail-closed den Boot, während er bei Loopback `QWEN_SERVER_TOKEN` verdeckt und den Bind im vertrauenswürdigen Token-losen Modus belässt, der unter `--require-auth` beschrieben ist. Das Standard-Loopback-Verhalten bleibt unverändert.

Bei Wildcard-Binds listet der Start tokenfreie lokale/Netzwerk-URLs von tatsächlichen Schnittstellen auf und — für das generierte Token oder für Ihr eigenes Token in einem interaktiven Terminal — einen **secret-bearing QR code** für eine gekennzeichnete private-LAN-Adresse. Die Wildcard-Aufzählung listet nur dieselbe private/link-local LAN-Population auf, die Local Control bewirbt (RFC 1918 / RFC 3927 IPv4, plus fc00::/7 ULA IPv6 bei Dual-Stack-Binds); der Software-Schnittstellenfilter, der VPN-Adapter und Container-Bridges ausschließt, ist eine **name heuristic** ([#9158](https://github.com/QwenLM/qwen-code/issues/9158)), keine Garantie, sodass k8s-Overlay-Namen (`cbr0`, `cali*`, `vxlan.*`) durchrutschen können. Ein expliziter Nicht-Loopback-Bind gibt stattdessen genau die gewählte Adresse aus und zeigt sie als QR-Code an — einschließlich einer routbaren Adresse. Innerhalb eines Containers ist die aufgezählte Adresse die eigene Schnittstelle des Containers, sodass das Erreichen eines veröffentlichten Ports bedeutet, die Host-Adresse einzusetzen; ein pty-zugewiesener Container zählt als interaktives Terminal, daher bleiben seine Logs geheimnisvoll. Scannen Sie den QR-Code, um die integrierte Web Shell mit dem Bearer-Token im URL-Fragment zu öffnen. Der Browser entfernt das Credential aus der URL und behält es im tab-spezifischen `sessionStorage`. Alternativ öffnen Sie eine gedruckte URL und geben das Token ein; fehlende oder abgelaufene Credentials zeigen ein Wiederholungsformular an. Generierte Tokens rotieren bei Neustart. `--no-web` lässt den QR-Code weg, und eine gepipelte/umgeleitete stdout gibt niemals ein stabiles Operator-Token innerhalb eines QR-Codes erneut frei — dieser Fall druckt einen Unterdrückungshinweis mit Nennung von `--token-qr` plus einen Adress-only-QR-Code (die Web Shell fragt bei Ankunft nach dem Token); übergeben Sie `--token-qr` oder setzen Sie `serve.tokenQr` in Benutzer-, System- oder Standard-Einstellungen, um dennoch den vollständigen Token-tragenden QR-Code zu drucken; `--no-token-qr` unterdrückt den Startup-Quickstart-Token-QR-Code für diesen Lauf auf jedem Quickstart-Pfad, einschließlich eines interaktiven Terminals und eines generierten Tokens (das weiterhin als eigene Klartextzeile gedruckt wird); es regelt nicht den Local-Control-Pairing-QR-Code, den `--local-control` per Design druckt. Wenn ein QR-Code angefordert wird, wo keiner gedruckt werden kann — `--no-web`, nicht aufgelöste Web-Shell-Assets oder ein Loopback-Bind — wird dies auf stderr gemeldet, statt nichts stillschweigend zu tun. Adressen implizieren keine Firewall- oder NAT-Erreichbarkeit; keine öffentliche IP wird automatisch erkannt.

Die Same-Origin-**HTTP**-Anfragen des integrierten Web Shell funktionieren ohne `--allow-origin`; andere Browser-Origin benötigen weiterhin diese Allowlist, und `Origin: null` wird weiterhin abgelehnt. WebSocket-basierte Funktionen (Terminal, Sprache) und Browser, die den Daemon über einen TLS-terminierenden Reverse Proxy erreichen, erfordern weiterhin einen expliziten Eintrag in `--allow-origin <origin>` – weitergeleitete Header werden niemals vertraut, um Same-Origin festzustellen. Gleiches gilt für jeden Plain-HTTP-Mittler, der den `Host`-Header umschreibt: nginx' Standard-`proxy_set_header Host $proxy_host` und k8s Ingress führen dazu, dass der Daemon einen `Host` sieht, der nicht mehr mit dem `Origin` des Browsers übereinstimmt. Übergeben Sie `--allow-origin <origin>` für die Origin, die Ihr Browser tatsächlich sieht, oder konfigurieren Sie den Proxy so, dass er `Host` unverändert weiterleitet. Bei einem **Non-Loopback**-Bind erfordert die reine Portübersetzung (`docker -p 8080:4170`) nichts – die Same-Origin-Prüfung vergleicht `Origin` mit dem weitergeleiteten `Host` und konsultiert niemals den lauschenden Port. Beim standardmäßigen **Loopback**-Bind ist dies nicht der Fall: Die DNS-Rebinding-Host-Allowlist akzeptiert nur den eigenen Port des Daemons, sodass ein portübersetzender Tunnel (`ssh -L 8080:localhost:4170`) bei jeder Anfrage, einschließlich des Shell-Dokuments, mit `403 Invalid Host header` abgelehnt wird, und `--allow-origin` kann dies nicht überschreiben – leiten Sie denselben Port weiter (`ssh -L 4170:localhost:4170`) oder binden Sie Non-Loopback. Der Pairing-QR-Code für **Mobile access** wird aus dem Schema und `Host` der Anfrage erstellt, die ihn anfordert – niemals aus weitergeleiteten Headern –, sodass hinter einem TLS-terminierenden Proxy das eigene `http`-Schema des Daemons beibehalten wird und der Austausch die `https`-Seite des Telefons ablehnt, weil die Einladung an die Origin gebunden ist, für die sie ausgestellt wurde. Pairen Sie beim Browsen der direkten Adresse des Daemons oder geben Sie das Token auf dem Telefon ein. Das Bearer-Token gewährt volle API-Autorität des Daemons, einschließlich Codeausführung. Behandeln Sie Terminal-Tokens und QR-Erfassungen als Geheimnisse. HTTP ist unverschlüsselt; die vorhandenen Optionen `--tls-cert` und `--tls-key` bieten HTTPS mit Ihrem eigenen Zertifikat.

Um einen Remote-Daemon von der Web Shell auf Ihrem eigenen Rechner zu verwenden, geben Sie die Origin des Remote-Daemons (zum Beispiel `https://dev-box.example:4170`) und sein Bearer-Token im Verbindungsbildschirm oder im **Daemon Status** ein. Der Remote-Daemon muss die Origin Ihrer lokalen Seite zulassen. Ein Browser-Tab auf einem festen Port kann diese Origin auflisten, zum Beispiel `qwen serve --hostname 0.0.0.0 --allow-origin http://localhost:4170`; das WebSocket des Terminals benötigt diesen Eintrag ebenfalls. Der **Desktop Client** unterscheidet sich: Er lädt seine eigene Shell von `http://127.0.0.1:<OS-assigned port>`, sodass sich seine Seiten-Origin bei jedem Start ändert und kein fester Eintrag darauf passt. Aktivieren Sie diese Origin-Klasse explizit mit `--allow-origin http://127.0.0.1:*`, was jeden Port auf genau diesem Loopback-Host sowohl für die REST-API als auch für das Terminal/Sprache-WebSocket zulässt. Bevorzugen Sie dies gegenüber `*`: `*` lässt jede Browser-Origin zu und deckt nur REST ab, nicht das WebSocket-Gate. Das Token wird pro Tab und pro Daemon-Origin gespeichert und niemals für einen anderen Daemon wiederverwendet. Die Seitenleiste listet Workspaces von einem ausgewählten Daemon gleichzeitig auf; das Wechseln der Daemons lädt die Seite neu und kombiniert keine lokalen und remote Projektlisten. Verwenden Sie das vorhandene Formular **Add workspace**, um einen absoluten Pfad auf dem ausgewählten Daemon zu registrieren. Ein Link, dessen `?daemon=` eine Origin nennt, mit der dieser Browser noch nie verbunden war, wird erst kontaktiert, nachdem Sie es im Verbindungsbildschirm bestätigt haben. Cross-Origin-Verbindungen bieten die browserlokale Dateibrücke nicht an, weder in der Standalone- noch in der eingebetteten Web Shell. Eine HTTPS-Seite kann sich nicht mit einem HTTP-Daemon verbinden, daher stellen Sie beide außerhalb vertrauenswürdiger Netzwerke über HTTPS bereit.

### 1. Daemon starten (Loopback, keine Auth)

```bash
cd your-project/
qwen serve
# → qwen serve listening on http://127.0.0.1:4170 (mode=http-bridge, workspace=/path/to/your-project)
# → qwen serve: trusted loopback mode; local callers have full API access without bearer authentication, including code execution as the daemon user. Use --require-auth with QWEN_SERVER_TOKEN on shared or untrusted hosts.
```

Der Standard-Bind ist `127.0.0.1:4170`. Bearer-Auth ist **aus** und der primäre Listener ist vertrauenswürdig, sodass jeder lokale Prozess, der den Port erreichen kann, die volle Operator-API nutzen kann, einschließlich Code-Ausführung als der Daemon-Benutzer. Routen-spezifische Workspace-Trust-, Session-Ownership-, `X-Qwen-Client-Id`-, Permission-, Feature-, Validierungs- und Ressourcenprüfungen gelten weiterhin. Der Daemon registriert das aktuelle Arbeitsverzeichnis als seinen primären Workspace; verwende ein absolutes `--workspace /path/to/dir`, um ihn zu überschreiben, und wiederhole das Flag, um zusätzliche isolierte Runtimes zu registrieren.

Für einen reinen API-Daemon deaktivieren Sie die Web Shell. Die Routen für Session, Prompt, Workspace, Berechtigung und SSE bleiben unverändert; die an die Web Shell gebundenen Oberflächen entfallen – die Aktivierung der Local Control schlägt auf jeder Plattform fehl, und die Routen `/live/*` (zusätzlich auf macOS mit `QWEN_SERVE_LIVE_NATIVE_HOST=1` das WebSocket `/live/host`) werden nicht registriert:

```bash
qwen serve --no-web
```

**Web-Shell-UI öffnen.** Navigiere zu `http://127.0.0.1:4170/` (oder starte den Daemon mit `qwen serve --open`, um sie automatisch zu öffnen) für das vollständige Browser-Terminal — Chat, Diffs, Commit-History, Tool-Calls und Permission-Prompts. Die UI wird am Daemon-Root auf derselben Origin wie die API ausgeliefert. Der Rest dieses Guides verwendet rohes HTTP, damit du direkt gegen die API skripten kannst.

Für einen authentifizierten Single-User-Start ohne manuelles Erstellen eines Tokens, opt-in explizit:

```bash
qwen serve --open-with-auth
```

Dieser Loopback-only-Modus generiert ein 256-Bit-Bearer-Token, wenn weder `--token` noch `QWEN_SERVER_TOKEN` eines bereitstellen, und übergibt es dann der geöffneten Web-Shell als `#token=` URL-Fragment. Die Shell entfernt das Fragment und hält die Credentials im `sessionStorage` dieses Tabs; Aktualisieren funktioniert, aber das Schließen des Tabs oder ein Neustart des Daemons verwirft die Credentials. In CI, SSH oder einer anderen Umgebung, in der Auto-Open nicht verfügbar ist, startet der Daemon und gibt die Fragment-URL zum manuellen Öffnen aus. Die ausgegebene URL enthält Secrets.

Das Flag ist standardmäßig aus, beinhaltet das Browser-Öffnen-Verhalten und erfordert das Vorhandensein der Web-Shell, gebauter Web-Shell-Assets und eines Loopback-Binds. Bare `qwen serve --open` bleibt token-less auf Loopback. Im Authenticated-Open-Modus lehnen normale API-Routen andere lokale Clients ohne Bearer ab; statische Web-Shell-Assets und Loopback-`/health` behalten ihr bestehendes vor-authentifiziertes Verhalten, außer `--require-auth` ist ebenfalls gesetzt. Für mehrere Clients oder eine wieder öffnbare Web-Shell verwende stattdessen ein stabiles Shared-Token:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --open
```

### 2. Plausibilitätsprüfung

```bash
curl http://127.0.0.1:4170/health
# → {"status":"ok"}

curl http://127.0.0.1:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":["health","daemon_status","capabilities","session_create",...],"workspaceCwd":"/path/to/your-project"}

curl http://127.0.0.1:4170/daemon/status
# → {"v":1,"detail":"summary","status":"ok","runtime":{...}}
```

Das Feld `workspaceCwd` zeigt den primären Kompatibilitäts-Arbeitsbereich an, damit Clients `cwd` bei `POST /session` absichtlich weglassen können. Aktuelle Clients sollten einen vertrauenswürdigen Eintrag aus `workspaces[]` auswählen und dessen `cwd` senden, wenn sie gezielt auf eine Laufzeitumgebung abzielen. Das Feld `limits.maxPendingPromptsPerSession` wirbt die aktive pro-Sitzung-Grenze für Prompt-Zulassung an; `null` bedeutet, dass die Grenze deaktiviert ist. `limits.maxTotalSessions` wirbt die optionale daemonweite Grenze für neue Sitzungen an; `null` bedeutet unbegrenzt.

### Einen lokalen Daemon inspizieren und steuern [#inspect-and-control-a-local-daemon]

`qwen serve` veröffentlicht einen lokalen Discovery-Datensatz für jeden aktiven Listener, sodass ein zweites Terminal nicht stdout parsen oder `ps` durchsuchen muss:

```bash
qwen daemon start --port 4170      # detached; waits for the discovery record
qwen daemon status                 # ports, PIDs, workspaces, and health
qwen daemon status --json          # one JSON object per daemon
qwen daemon status --detail        # version, uptime, sessions, and issues
qwen daemon logs --port 4170 -f    # follow the recorded log file
qwen daemon stop --port 4170       # SIGTERM the recorded process
qwen daemon restart --port 4170    # stop, then start with the recorded settings
```

Datensätze befinden sich im Runtime-Verzeichnis (`$QWEN_RUNTIME_DIR`, `$QWEN_HOME` oder `~/.qwen`) unter `daemon/daemon-<port>.json`. Sie sind auf POSIX `0600` und enthalten niemals das Bearer-Token. Ein Datensatz, der von einem abgestürzten Daemon hinterlassen wurde, wird als `stale` gemeldet; `status --prune` oder `stop` entfernt ihn. `stop` sendet `SIGTERM` erst, nachdem der Listener `/health` beantwortet hat oder seine PID noch lebt; `--force` fügt `SIGKILL` nach dem Graceful-Timeout hinzu. Wenn mehr als ein Daemon registriert ist, übergeben Sie `--port`; `stop` akzeptiert auch `--all`.

`status --detail` fragt den Daemon nach seinem eigenen Status: Version, Uptime, aktive Sessions und Anzahl der Issues. Es sendet `QWEN_SERVER_TOKEN` nur, wenn der Datensatz angibt, dass der Daemon ein Bearer verwendet, und der aufgezeichnete Prozess lebt, adressierbar ist und gestartet wurde, als der Datensatz dies besagt; ein Datensatz, dessen aufgezeichneter PID-Namensraum von diesem Prozess nicht adressiert werden kann, erhält niemals das Bearer-Token. Ohne Token meldet ein Daemon, der ein Bearer erfordert, dass Authentifizierung erforderlich ist.

`qwen daemon start` startet `qwen serve` detached, wartet auf seinen Discovery-Datensatz und gibt die gebundene URL, PID, Log-Pfad und Stop-Befehl aus. Es verwirft die Identifikatoren und privaten Capability-Bindungen der startenden Session, damit das Kind ein frischer Daemon ist, behält die Modell/Auth-Umgebung des Operators bei und übergibt `--no-token-qr`, damit das Startup-Log kein Token enthalten kann. Workspaces werden kanonisiert, relative Runtime-Verzeichnisse vor dem Spawn an das Startverzeichnis angeheftet und Windows-laufwerksrelative Wurzeln gegen das Startlaufwerk aufgelöst. Ein Non-Loopback-Bind erfordert `QWEN_SERVER_TOKEN`; verwenden Sie `qwen serve` direkt, wenn Sie ein ephemeres Token wünschen. Das Startup-Log ist `0600` und wird nach erfolgreichem Start entfernt. `--wait` wartet, bis die Runtime bedient (kein `daemon_runtime_starting`-Issue und nicht `error`); ein Timeout behält das Startup-Log bei und beendet sich mit non-zero Exit-Code.

Für einen authentifizierten Hintergrund-Daemon mit wiederverwendbaren lokalen Credentials versorgen Sie ein stabiles Token über die Umgebung und aktivieren Sie das Token-Sidecar:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen daemon start --require-auth --save-token --wait
qwen daemon token --port 4170          # print the saved bearer; treat the output as a secret
qwen daemon token --port 4170 --remove # delete only the local sidecar
```

Bevorzugen Sie `QWEN_SERVER_TOKEN` gegenüber `--token`, das in der Shell-Prozessliste sichtbar ist. `--save-token` erfordert ein explizit bereitgestelltes Token und verweigert den Spawn ohne eines. Das Sidecar ist `daemon/daemon-<port>-<pid>.token` unter demselben Runtime-Verzeichnis wie der Discovery-Datensatz; es ist auf POSIX `0600` und wird niemals in den Discovery-Datensatz oder das Daemon-Log aufgenommen. `qwen daemon stop` entfernt es, während `qwen daemon restart` es zur Ersatzinstanz mitnimmt. `qwen daemon token --remove` löscht die lokale Kopie, ändert oder widerruft aber nicht die Credential des laufenden Daemons; stoppen und starten Sie den Daemon mit einem neuen Token, um es zu rotieren. Gewöhnliches `qwen serve`, einschließlich `--open-with-auth`, schreibt dieses Sidecar nicht.

`qwen daemon restart` stoppt einen registrierten Daemon über `daemon stop` und startet ihn über `daemon start --wait` auf dem aufgezeichneten Port und Hostnamen neu, mit den aufgezeichneten Start-Workspaces, dem Conversations-Arbeitsverzeichnis-Stamm, dem Web Shell-Modus und der Einstellung `--require-auth`; `--web`/`--no-web` und `--require-auth`/`--no-require-auth` überschreiben die Aufzeichnung. Persistierte Workspace-Registrierungen werden vom neuen Daemon selbst wiederhergestellt, nicht als `--workspace` erneut abgespielt. Jede andere Option von `qwen serve` (zum Beispiel `--profile`, `--channel`, `--allow-origin` oder Ratenlimits) wird auf ihren Standardwert zurückgesetzt, daher starten Sie einen Daemon, der mit diesen konfiguriert ist, über `qwen serve` neu. Bevor etwas gestoppt wird, lehnt restart einen HTTPS-Daemon, einen Start-Workspace, der nicht mehr existiert, einen Lauf aus einer Shell heraus, die der Daemon hostet (wie sein Web Shell-Terminal), und einen Bearer-Daemon ohne `--token` oder `QWEN_SERVER_TOKEN` ab; ein laufender Bearer-Daemon muss das Token akzeptieren, daher rotiert restart niemals die Anmeldeinformationen. Ein Token, das nur in einem Workspace-`.env` oder Einstellungsdatei gespeichert ist, wird von `qwen daemon` nicht gelesen. `--force` wird nur an `daemon stop` weitergeleitet, wenn Sie es übergeben. Wenn der aufgezeichnete Port belegt ist, startet der Daemon auf dem nächsten freien Port und restart beendet sich mit einem Non-Zero-Exit-Code.

Der von einem aktuellen Daemon aufgezeichnete Conversations-Stamm wird von `daemon restart` beibehalten, auch wenn sich `QWEN_CONVERSATIONS_DIR` in der Neustart-Shell geändert hat. Ältere Discovery-Aufzeichnungen ohne dieses Feld verwenden erneut die Startumgebung oder den Standardwert; sie können die vorherige Auswahl nicht garantieren. Um einen anderen Stamm auszuwählen, stoppen Sie den Daemon und starten Sie ihn mit dem neuen Wert. Siehe [Conversations-Arbeitsverzeichnis](#conversations-working-directory) für Anforderungen zur Persistenz und Wiederherstellung.

### Workspace-Registrierungskapazität

Das Standard-Registrierungslimit ist 256. Setze `QWEN_SERVE_MAX_WORKSPACES=25 qwen serve --workspace /path/to/project`, um es zu verringern; akzeptierte Werte sind dezimale Ganzzahlen von 1 bis 256. Ungültige Werte schlagen beim Start fehl. Dies ist eine Daemon-Starteinstellung: Projekt-`.env` und Projekt-`settings.env` können sie nicht ändern. Eingebettete Caller können `ServeOptions.maxRegisteredWorkspaces` setzen, was Vorrang vor der Startumgebung hat.

Das Limit zählt den primären Workspace, registrierte sekundäre Workspaces und benutzererstellte Scratch-Workspaces. Die interne Conversations-Runtime ist ausgenommen. Dynamische Registrierung gibt `409 workspace_limit_reached` bei Kapazität zurück. `GET /capabilities` und `GET /daemon/status` legen `limits.maxRegisteredWorkspaces` offen.

Bei der Standard-Registrierungskapazität von 256 verwendet der Standard-Daemon eine feste globale Session-Obergrenze von 800, einschließlich eines Daemons, der mit nur einem Workspace gestartet wurde. Dasselbe Session-Standard gilt für jede konfigurierte Registrierungskapazität über 25. `--max-total-sessions` überschreibt sie weiterhin; `0` deaktiviert sie. Bei Kapazitäten von 25 oder weniger bleibt der bestehende Standard: ein Startup- oder wiederhergestellter Workspace ist unbegrenzt, und mehrere leiten die Gesamtzahl aus der pro-Workspace-Obergrenze und dieser Anzahl ab. Registrierungsänderungen berechnen die Gesamtzahl nicht neu. Dies ändert nicht die ACP-Child-Speicherpolitik oder verspricht 800 sichere gleichzeitige Sessions.

Die Channel-Steuerung unterstützt unabhängig höchstens 25 Workspace-Owner, exposed als `limits.maxChannelControlWorkspaces`. Ein Transition zählt auch Owner, die für die Wiederherstellung beibehalten werden; stoppe bei Kapazität erfolgreich alle ausgewählten Channels auf einem alten Owner, bevor du einen neuen Owner hinzufügst. Eine übergroße Transition gibt `409 channel_control_workspace_limit_reached` zurück. `--channel all` wählt weiterhin nur den primären Workspace aus. Das Channel-SDK-Timeout bleibt unverändert.

Persistierte Registrierungsdateien behalten Schema-Version 1 und unterstützen bis zu 255 sekundäre Datensätze innerhalb von 8 MiB. Rohdatensätze, einschließlich veralteter Aliase, verbrauchen persistente Slots bis zum Vergessen. Wenn das vollständige gültige Startup-Set das konfigurierte Limit überschreitet, schlägt der Start fehl und lässt die Datei unverändert. Um die Kapazität zu verringern, starte mit der vorherigen Kapazität neu, vergiss ausreichend Registrierungen und reduziere explizite `--workspace`-Argumente vor dem Neustart mit dem niedrigeren Limit. Vor dem Downgrade auf eine ältere Binary sichere die Datei und verwende die neuere Binary, um sie auf höchstens 24 sekundäre Datensätze und 256 KiB zu verkleinern. Ältere Binaries lehnen diesen Store andernfalls ab und starten nur mit expliziten Workspaces; ihre Store-Mutationen schlagen vor dem Schreiben fehl.

### Sitzungs-Live-State-Polling anpassen

Die Web Shell aktualisiert den Live-State der Workspace-Sitzung standardmäßig alle **5 Sekunden**. Um ein anderes Intervall zu verwenden, setze die Daemon-Umgebungsvariable vor dem Start:

```bash
QWEN_SESSION_LIVE_STATE_POLL_INTERVAL_MS=10000 qwen serve --web
```

Der Wert ist eine Ganzzahl in Millisekunden, von `1000` bis `2147483647`. Fehlende oder ungültige Werte fallen auf `5000` zurück. Das Intervall gilt für alle Workspaces, die von diesem Daemon bedient werden; starte den Daemon neu und lade offene Web-Shell-Seiten nach einer Änderung neu. Lokale Session-Aktionen und die Rückkehr zu einem sichtbaren Tab können weiterhin sofort aktualisieren. Dies ändert nur das Live-State-Polling, nicht das vollständige Session-Katalog-Polling.

Der Daemon veröffentlicht das effektive Intervall als `sessionLiveStatePollIntervalMs` in `/capabilities`. Die Web Shell verwendet diesen Wert und fällt auf fünf Sekunden zurück, wenn sie sich mit einem älteren Daemon verbindet, der ihn weglässt. SDK-Nutzer können den Wert lesen, wenn sie ihren eigenen Polling-Zeitplan wählen.

### Channels vom Daemon aus ausführen

```bash
# Start one configured channel under qwen serve
qwen serve --channel telegram

# Start several configured channels under daemon-owned workspace workers
qwen serve --channel telegram --channel feishu

# Start all configured channels
qwen serve --channel all

# Or start a token-protected daemon with no channel worker
QWEN_SERVER_TOKEN=secret qwen serve

# Enable or replace its runtime selection later
qwen channel set telegram --token secret
qwen channel set telegram feishu --token secret
qwen channel set all --token secret

# Inspect or stop daemon-managed channels
qwen channel status --daemon-url http://127.0.0.1:4170 --token secret
qwen channel stop --daemon-url http://127.0.0.1:4170 --token secret
```

Dieser Modus ist experimentell und daemon-verwaltet. Er ersetzt nicht den eigenständigen Befehl `qwen channel start`: ohne `--daemon-url` bleibt das bestehende Verhalten von `qwen channel start`, `stop` und `status` eigenständig. Mit `qwen serve --channel` gewinnt die explizite Auswahl, der Daemon reserviert den Kanal-Service-Lease vor dem Lauschen, und der Start schlägt fehl, wenn der initiale Worker nicht bereit werden kann. Bei einem boot ohne Flags stellt der Daemon `serve.channels` aus jedem vertrauenswürdigen registrierten Workspace wieder her, sodass ein Kanal, der für einen Nicht-Primär-Workspace zum Start konfiguriert ist, zusammen mit dem Daemon zurückkehrt, anstatt einen Runtime-API-Aufruf zu benötigen. Wenn keine Quelle Kanäle auswählt, bleibt die schwere Kanal-Runtime entladen und kein Kanal-Service-Lease wird reserviert, bis der erste Runtime-PUT eingeht oder bis ein Workspace, der seine eigenen `serve.channels` konfiguriert, registriert wird. Ein vertrauenswürdiger Workspace, der nach dem Start des Daemons registriert wurde, stellt ebenfalls seine eigenen `serve.channels` wieder her, einmal pro Daemon-Lauf: eine spätere erneute Registrierung — nachdem er entfernt wurde oder nachdem sein Vertrauensstatus neu konfiguriert wurde — wiederholt die Wiederherstellung nicht, sodass ein Kanal, den Sie zwischenzeitlich gestoppt haben, gestoppt bleibt. Das Starten des Daemons mit einem expliziten `--channel` überspringt dies vollständig, ebenso wie das Stoppen von Kanälen mit `qwen channel stop` (`DELETE /workspace/channel`), bis ein `qwen channel set` sie wieder aktiviert: Die Registrierung eines Workspaces ist keine Anfrage, das Hosting wieder einzuschalten. Im Gegensatz zur Boot-Wiederherstellung, die einen Namen überspringt, den sie nicht hosten kann, und den Rest behält, erhält ein späterer Workspace, dessen Liste einen solchen Namen enthält, keinen seiner Kanäle zurück, und das Daemon-Log protokolliert den Grund. Die Registrierung des Workspaces wartet nicht darauf, dass seine Kanäle hochfahren. Ein Kanalname, der von einem Workspace aufgelistet wird, der ihn nicht hosten kann, wird mit einem Logeintrag übersprungen, wobei die Kanäle der anderen Workspaces laufen bleiben; `all` gilt weiterhin nur für den Primär-Workspace. Wenn ein vorbereiteter Worker später abstürzt, läuft der Daemon weiter, startet ihn unter einer begrenzten Neustart-Richtlinie neu und meldet seinen Zustand (einschließlich Warnungen zu `channel_worker_exited`) in `GET /daemon/status`.

Die automatische Wiederherstellung überspringt ein ungültiges Startup-Feld oder einen Validierungs- oder Lease-Fehler vor dem Start der Worker, protokolliert seine `serve.channels`-Quelle und lässt unbezogene Einstellungen in Kraft. Nachdem ein Worker-Start fehlschlägt, fährt der Daemon nur fort, wenn die Bereinigung erfolgreich ist. Globale Runtime-Startup-Timeouts und unbestätigte Worker-Stopps behalten das normale Startup-Fehlerverhalten bei; die Service-Lease bleibt gehalten, während die Worker-Beendigung unbestätigt ist. Prüfe das Daemon-Log auf übersprungene oder fehlgeschlagene Wiederherstellungen.

Gespeicherte Startup-Namen müssen nicht-leer sein, dürfen keine führenden oder nachfolgenden Leerzeichen haben und keine unsicheren Steuer- oder unsichtbaren Zeichen enthalten. Ungültige Einträge werden einzeln übersprungen und nach Array-Index protokolliert. Startup trimmt sie weder zu einem anderen Instanznamen noch schreibt es die Einstellungen um. Der Channel-Startup-Toggle spiegelt die persistierte Konfiguration wider, während der Runtime-Zustand meldet, ob der Channel läuft.

Die Runtime-Steuerung wird als `GET`, `PUT` und `DELETE /workspace/channel` exposed; SDK-Helper sind `getChannelWorkerControl()`, `setChannelWorkerSelection()` und `stopChannelWorker()`. PUT/DELETE/Reload verwenden das strikte Mutations-Gate: vertrauenswürdige Loopback-Primary-Caller können sie ohne Token verwenden, während andere Deployments Operator-Credentials erfordern. Runtime-Auswahlen sind absichtlich ephemer: PUT bearbeitet nicht die Settings oder Boot-Optionen, und ein Neustart kehrt zur expliziten `qwen serve --channel`-Auswahl zurück, andernfalls zur `serve.channels` des vertrauenswürdigen primären Workspaces, oder zu deaktiviert, wenn keines vorhanden ist. Explizite CLI- und Runtime-benannte Auswahlen werden gekürzt und in Reihenfolge des ersten Vorkommens dedupliziert; die Reihenfolge bleibt erhalten, da der erste Channel die gemeinsame Modellauswahl beeinflussen kann.

Daemon-gestützte `qwen channel set` und `qwen channel reload` sowie `status` und `stop` mit `--daemon-url` können ein durch `--open-with-auth` generiertes Token nicht entdecken. Verwende `QWEN_SERVER_TOKEN` und übergebe denselben Wert mit `--token` an diese Clients, oder lasse den Authenticated-Open-Modus weg.

Der Daemon liest die Settings jedes Channels (Tokens, `proxy`, `model` pro Channel) beim Start seines Workers. Um Settings neu zu lesen, ohne die festgelegte Auswahl zu ändern, rufe `POST /workspace/channel/reload` auf (SDK `client.reloadChannelWorker()` oder `qwen channel reload`). Reload löst die Workspace-Zugehörigkeit neu auf und startet ausgewählte Worker über denselben Rollback-sicheren reconcile-Pfad neu. Die `channel_control`-Capability ist vorhanden, wenn die Runtime-Steuerung verdrahtet ist; `channel_reload` ist nur vorhanden, während der Manager aktiviert ist. Persistierte Threads werden von der Festplatte wiederhergestellt.

Das `cwd` jedes ausgewählten Channels muss auf einen registrierten Workspace auflösen, und Channels werden nach diesem besitzenden Workspace gruppiert: Ein Single-Workspace-Daemon betreibt einen Worker (unverändert wie zuvor); ein Multi-Workspace-Daemon (`--workspace` wiederholt) betreibt einen Worker pro Workspace, der einen ausgewählten Channel besitzt, jeweils gebunden an das cwd, `QWEN_DAEMON_WORKSPACE` und das Env-Overlay des Workspaces. Um einen Channel in einem nicht-primären Workspace zu hosten, definiere ihn in der eigenen `.qwen/settings.json` des Workspaces (kein `cwd` erforderlich) oder setze ein explizites `cwd` gleich dem Workspace-Pfad; ein Channel, der nur im Benutzer-/System-Scope ohne `cwd` definiert ist, ist über Workspaces hinweg mehrdeutig: eine explizite `--channel`-Auswahl schlägt beim Start fehl, während die automatische Wiederherstellung den Zugehörigkeitsfehler protokolliert und diese Auswahl vor dem Start der Worker überspringt. `--channel all` bleibt primär-only (es hostet die Channels des primären Workspaces) und kann nicht mit benannten Channels kombiniert werden.

Das Ersetzen einer Auswahl prüft Konfiguration, Eigentümerschaft und Vertrauen vorab, bevor irgendetwas gestoppt wird. Es behält Workspace-Worker bei, deren geordnete Auswahl unverändert ist. Wenn ein geänderter Worker nicht starten kann, stoppt der Daemon neue Worker und stellt die alte Auswahl wieder her. Wenn der Daemon nicht bestätigen kann, dass ein alter Kindprozess selbst nach SIGKILL beendet wurde, behält er den PID-Lease bei und weigert sich, einen doppelten Worker zu erstellen. Ein Worker wird weiterhin als bereit betrachtet, wenn mindestens ein angeforderter Adapter verbunden ist; PUT gibt dann `partial: true` zurück, und `/daemon/status` meldet `channel_worker_partial_connect` für die fehlenden Adapter. Ein Name von `serve.channels`, den der Daemon nicht hochfahren konnte — eine konfigurierte Auswahl, deren Worker nicht gestartet wurde, ein Name, den boot nicht zuordnen konnte, oder einer, der durch die Wiederherstellung einer späten Registrierung unten blieb — wird auf `/daemon/status` als `channel_restore_failed` gemeldet und erscheint in der Kanalliste dieses Workspaces als `error` mit seinem `lastError`, wenn die eigenen Einstellungen dieses Workspaces ihn definieren. Andere Gründe, warum ein Name nicht gehostet bleibt, stehen nur im Daemon-Log.

Wenn ein Adapter `connect()` ablehnt, können aktuelle Worker-Snapshots `startupFailures`-Einträge mit dem Channel, `phase: "connect"`, einem optionalen Adapter-Code und einer Credential-bereinigten Nachricht enthalten. `qwen channel set`, `qwen channel reload` und Remote-`qwen channel status --daemon-url …` geben diese Gründe aus. Wenn jeder Adapter bei einem dynamischen Set oder Reload fehlschlägt, erhält der Befehl `502 channel_worker_start_failed`; die Antwortgründe beschreiben diesen Versuch und sein `state` beschreibt das Ergebnis nach dem Rollback. Der fehlgeschlagene Versuch wird von späteren Statusanfragen nicht beibehalten. Maximal 64 Gründe werden pro Worker-Start beibehalten, und Adapter-Codes sollten als diagnostisch und nicht als stabile Kategorien behandelt werden. Der initiale Start von `qwen serve --channel …` beendet sich weiterhin, wenn kein Adapter verbunden wird.

Der Daemon stellt auch schreibgeschützte Laufzeit-Snapshots für Client-UIs und Operatoren bereit: `GET /daemon/status`, `GET /workspace/mcp`, `GET /workspace/skills`, `GET /workspace/providers`, `GET /workspace/env`, `GET /workspace/preflight`, `GET /workspace/:id/session-info`, `GET /session/:id/status`, `GET /session/:id/context`, `GET /session/:id/supported-commands`, sowie `GET /session/:id/tasks`, `GET /session/:id/lsp`, `GET /session/:id/resources` und `GET /session/:id/transcript`.

`GET /workspace/:id/session-info` (und das Plural-Pendant `GET /workspaces/:workspace/session-info`) gibt aggregierte Sitzungszahlen für einen Arbeitsbereich zurück: persistierte `active` / `archived` / `total`, plus die aktuelle In-Memory-Anzahl `live`, falls Live-State verfügbar ist. Registrierte nicht vertrauenswürdige sekundäre Arbeitsbereiche lassen `live` weg, da ihre Katalog-Lesevorgänge nicht die Live-Bridge abfragen. Die paginierte Liste `GET /workspace/:id/sessions` enthält keine Gesamtanzahl, daher ist dies die dedizierte Oberfläche für „Wie viele Sitzungen existieren?“ – nützlich, wenn geplante oder wiederkehrende Aufgaben einen großen lokalen Speicher hinterlassen.

> ⚠️ **Festplatten-Scan – nicht pollern.** Dieser Endpunkt durchsucht lokale Session-JSONL-Dateien unter dem Verzeichnis für Chats des Arbeitsbereichs. Antworten enthalten immer `expensive: true` und `cost: "disk_scan"`. Rufen Sie ihn selten auf (manuelle Aktualisierung, Operator-Tools, gelegentlicher UI-Load) – niemals auf einem engen Timer oder bei jedem Sidebar-Render. Bevorzugen Sie `GET /workspace/:id/sessions` zum Durchblättern von Seiten und `GET /daemon/status` für Live-In-Memory-Sitzungszahlen. Eine Antwort mit `truncated: true` bedeutet, dass der Scan seine Sicherheitsgrenze erreicht hat oder nicht jede Kandidatendatei klassifizieren konnte, sodass die persistierten Zahlen Untergrenzen sind.

```bash
curl http://127.0.0.1:4170/workspace/$(python3 -c "import urllib.parse,os; print(urllib.parse.quote(os.getcwd(), safe=''))")/session-info
# → {"active":450,"archived":30,"total":480,"live":2,"expensive":true,"cost":"disk_scan"}
```

`GET /session/:id/status` gibt die Live-Bridge-Zusammenfassung für eine einzelne Sitzung zurück: `sessionId`, `workspaceCwd`, `createdAt`, optional `displayName`, `clientCount` und `hasActivePrompt`. Es antwortet mit `200` und der Zusammenfassung, wenn der Daemon eine Live-Sitzung mit dieser ID hält, andernfalls mit `404` (Body `{ "error": …, "sessionId": … }`). Verwenden Sie es, um zu prüfen, ob eine bekannte Sitzung noch läuft (`hasActivePrompt`) oder wie viele Clients verbunden sind (`clientCount`), ohne die gesamte paginierte Sitzungsliste abzurufen und zu scannen:

```bash
curl http://127.0.0.1:4170/session/$SESSION_ID/status
# → {"sessionId":"…","workspaceCwd":"…","createdAt":"…","clientCount":1,"hasActivePrompt":false}
```

Dies ist die Rohansicht der Live-Sitzung, daher entsprechen `clientCount` und `hasActivePrompt` dem entsprechenden Eintrag in `GET /workspace/:id/sessions` – aber die beiden Routen sind nicht byte-identisch. Der Listen-Endpunkt angereichert jedes Element mit Daten aus dem persistierten Sitzungsspeicher: Sein `createdAt` ist die Zeit des ersten Prompts aus dem Persistenzspeicher, und er fügt `updatedAt` sowie ein aus dem gespeicherten Titel oder ersten Prompt abgeleitetes `displayName` hinzu. `/status` meldet stattdessen das `createdAt` der Live-Sitzung selbst, lässt `updatedAt` weg und gibt `displayName` nur zurück, wenn eines auf der Live-Sitzung gesetzt ist.

`GET /session/:id/lsp` gibt strukturierte LSP-Statusinformationen pro Sitzung zurück. Starten Sie den Daemon mit `--experimental-lsp`, um LSP in erzeugten Agent-Sitzungen zu aktivieren; andernfalls gibt die Route `enabled: false` ohne Server zurück.

`GET /session/:id/resources` gibt die bereinigten Skill- und MCP-Snapshots aus der eigenen Config dieser Live-Sitzung zurück. Verwenden Sie es, wenn eine Sitzung möglicherweise aus einem Worktree oder einem anderen effektiven Verzeichnis läuft, dessen Ressourcen sich vom Basis-Arbeitsbereich unterscheiden. Details zur MCP-Authentifizierung, -Pool, -Budget und -Entdeckungsfehler des Arbeitsbereichs werden in dieser Sitzungsansicht ausgelassen. Prüfen Sie die Fähigkeit `session_resources` vor dem Aufruf.

`GET /daemon/status` ist der konsolidierte Fehlerbehebungs-Snapshot. Die Standard-`detail=summary` liest nur den In-Memory-Daemon-Zustand (Sitzungen, Berechtigungen, SSE/ACP-Transportzähler, Ratenlimit-Ablehnungen, Prozessspeicher, aufgelöste Limits) und startet das ACP-Kind nicht. Verwenden Sie `GET /daemon/status?detail=full` für sitzungsspezifische Diagnosen, ACP-Verbindungsdetails, Auth-Gerätefluss-Zähler und Workspace-Statusabschnitte, wenn Sie aktiv ein Problem untersuchen.

`GET /workspace/mcp` meldet die aktive ACP-Laufzeitumgebung und startet das ACP-Kind im Leerlauf nicht; ein Daemon im Leerlauf gibt `initialized: false` mit einem leeren Snapshot zurück. Sobald eine Sitzung aktiv ist, wechselt sie zu `initialized: true` und zeigt den tatsächlichen Zustand an.

`GET /workspace/providers` wird lokal vom Daemon aus Workspace-Einstellungen und Umgebung beantwortet, hängt also nicht davon ab, dass ein ACP-Kind aktiv ist, und `acpChannelLive` ist das Lebensfähigkeits-Signal. Wenn die Workspace-Einstellungen oder die Modellkonfiguration nicht aufgelöst werden können, enthält die Antwort `initialized: false`, ein leeres `providers`-Array und einen `errors`-Eintrag. Die Route greift nur auf den aktiven ACP-Snapshot zurück, wenn ein Daemon ohne daemon-lokalen Provider-Status-Builder konstruiert wurde; die daemon-lokale Antwort enthält niemals zur Laufzeit registrierte Modelle.

`GET /workspace/skills` gibt sofort eine beibehaltene Daemon-Beobachtung zurück und validiert sie im Hintergrund neu, sodass ein warmer Lesevorgang nicht auf das ACP-Kind wartet. Das optionale `snapshot`-Objekt meldet `observedAt`, `ageMs`, `stale` und `refreshing`; prüfen Sie `ageMs`, bevor Sie den Katalog als aktuell betrachten. Vor der ersten erfolgreichen Beobachtung kann ein Lesevorgang innerhalb des Ein-Sekunden-Start-Throttle-Fensters `initialized: false` mit einem `errors`-Eintrag zurückgeben, anstatt zu warten; dies ist eine wiederholbare Nichtverfügbarkeit, kein leerer Katalog.

Um Workspace-Skill-Einstellungen nach Name zu aktualisieren, rufe `POST /workspace/skills/:name/enable` mit `{ "enabled": true | false }` auf, nachdem du die `workspace_skill_settings_toggle`-Capability geprüft hast. Um mehrere Namen zu ändern, prüfe `workspace_skill_settings_batch_toggle` und rufe `POST /workspace/skills/enable` mit `{ "skillNames": ["review", "deploy"], "enabled": false }` auf; es verarbeitet jeden strukturell gültigen Namen zusammen, persistiert alle resultierenden Deklarationsänderungen in höchstens einem gesperrten Settings-Write und aktualisiert aktive ACP-Sitzungen einmalig, wenn sich etwas geändert hat. Diese Routen schreiben `skills.disabled` und `skills.enabled` des Workspaces, ohne den geladene Skill-Katalog zu konsultieren, sodass Namen vor der Installation oder während ihre Extension inaktiv ist deaktiviert werden können. Das Aktivieren entfernt ein passendes Workspace-Disable und zeichnet ein explizites `skills.enabled`-Opt-In auf, auch vor der Installation, sodass dieser Eintrag ein internes Skill-Disablement einer Extension überschreiben kann. Dieselbe Deklaration zu wiederholen ist ein No-Op (`changed: false`). Ihre Pfade und Request-Bodies bleiben unverändert; die Settings-spezifischen Capabilities ersetzen die zurückgezogenen katalog-validierten Skill-Toggle-Tags. Das Batch-`errors`-Array bleibt für Wire-Kompatibilität und ist bei strukturell gültigen Namen leer. Ein harter `skills.disabled`-Eintrag, der von einem höheren Scope geerbt wurde, bleibt maßgeblich für die effektive Verfügbarkeit, blockiert aber nicht den Workspace dabei, seine eigene Deklaration aufzuzeichnen oder zu entfernen. Skill-Status-Zellen legen `disabledReason` (`hard`, `default` oder `inactive_extension`) und ein optionales `lockedScope` offen. Nicht vertrauenswürdige Workspace-Schreibvorgänge werden weiterhin abgelehnt. Eine `deferred`-Antwort bedeutet, dass kein Child beim Liveness-Check live war oder eine geänderte Anfrage ihr Child/Session während des erforderlichen Refreshs verloren hat; wenn `changed` true ist, wird die persistierte Deklaration angewendet, wenn ein Child startet. Ob eine Deklaration sich tatsächlich geändert hat, wird von `changed` berichtet (bei jedem Ergebnis für eine Batch-Anfrage). `skills.disabled` deaktiviert sowohl manuelle als auch Modell-Nutzung, im Gegensatz zu `disable-model-invocation: true`, das die direkte `/skill-name`-Invocation verfügbar hält. Für V2-Extension-Batches prüfe `extension_batch_activation_v2`: `PUT /extensions/activation` ändert globale Standards, während `PUT /workspaces/:workspace/extensions/activation` genaue Overrides für den ausgewählten Workspace ändert und `"inherit"` zum Löschen akzeptiert. Beide akzeptieren Namen in `extensionNames`; `enabled` und `disabled` können vor der Installation deklariert werden, während `inherit` für einen unbekannten Namen ein No-Op ist. Jede Anfrage gibt eine Operation zum Pollen zurück. Wenn `extension_activation_explicit_refresh` beworben wird, endet diese Operation nachdem die Aktivierungs-Policy committed wurde und aktualisiert aktive Sitzungen nicht direkt. Um sie sofort anzuwenden, reiche den unabhängigen primären oder Workspace-qualifizierten Extension-Refresh nach der erfolgreichen Aktivierung ein. Ohne diesen expliziten Refresh können andere Workspaces die vorherige Aktivierung bis zum nächsten 30-Sekunden-Generation-Reconciler-Pass weiterhin verwenden; fehlgeschlagene Reconciliation wird von späteren Passes wiederholt.

`GET /workspace/env` und `GET /workspace/preflight` antworten unabhängig vom ACP-Zustand immer mit `initialized: true`. `env` konsultiert niemals ACP (nur Daemon-Prozessinformationen); `preflight` beantwortet Daemon-Level-Zellen aus `process.*` und gibt `status: 'not_started'`-Platzhalter für ACP-Level-Zellen aus, wenn das Kind im Leerlauf ist.

`GET /workspace/env` meldet die Laufzeitumgebung, Plattform, Sandbox, Proxy und die **Existenz** (niemals den Wert) von auf der Whitelist stehenden geheimen Umgebungsvariablen wie `OPENAI_API_KEY` des Daemon-Prozesses. Proxy-URLs werden vor der Übertragung über das Netzwerk von Anmeldedaten bereinigt und auf `host:port` reduziert. Die Route antwortet immer direkt aus dem Daemon-Prozess und erzeugt niemals ein ACP-Kind.

`GET /workspace/preflight` gibt eine Liste der Bereitschaftsprüfungen zurück. **Daemon-Level-Zellen** (Node-Version, CLI-Einstiegspunkt, Workspace-Verzeichnis, ripgrep, git, npm) werden immer gerendert. **ACP-Level-Zellen** (Auth, MCP-Entdeckung, Skills, Provider, Tool-Registry, Egress) erfordern ein aktives ACP-Kind – wenn der Daemon im Leerlauf ist, geben sie `status: 'not_started'`-Platzhalter aus, anstatt ACP nur zum Auffüllen zu starten. Fehler werden einem geschlossenen `errorKind`-Enum zugeordnet (`missing_binary`, `auth_env_error`, `init_timeout`, `restore_timeout`, `protocol_error`, `missing_file`, `parse_error`, `blocked_egress`), damit Client-UIs strukturierte Korrekturmaßnahmen anzeigen können.

Der Daemon stellt auch Workspace-Datei-Helfer bereit:

- `GET /file` liest Textdateien. Vollständige Snapshot-Antworten geben einen Rohbyte-`sha256:<hex>`-Hash zurück; begrenzte Zeilenfenster aus Dateien über 256 KiB lassen ihn weg.
- `GET /file/bytes` liest begrenzte Raw-Byte-Fenster und gibt Base64-Content zurück.
- `POST /file/write` erstellt oder ersetzt Textdateien.
- `POST /file/edit` wendet genau eine Textersetzung an.

Schreiben/Bearbeiten sind **strikte Mutationsrouten**: Der primäre Listener ohne Token für vertrauenswürdige Loopbacks gewährt Operator-Berechtigung; nicht vertrauenswürdige Einbettungen ohne Anmeldeinformationen geben `token_required` zurück. Ersetzungen und Bearbeitungen erfordern das neueste `expectedHash` aus einem vollständigen Snapshot-`GET /file` (oder einem vollständigen Fenster-`GET /file/bytes`). Ein teilweises großes Dateifenster kann nicht als Optimistic-Concurrency-Token verwendet werden. `create` überschreibt niemals. Explizite Schreibvorgänge in ignorierte Pfade sind erlaubt, aber protokolliert. Binäre Schreibvorgänge, Löschen/Verschieben/Mkdir und rekursive Eltern-Erstellung gehören nicht zu dieser Oberfläche.

### 3. Öffnen einer Sitzung

```bash
curl -X POST http://127.0.0.1:4170/session \
  -H 'Content-Type: application/json' \
  -d '{}'
# → {"sessionId":"<uuid>","workspaceCwd":"…","attached":false}
```

`cwd` kann weggelassen werden — die Route fällt auf den primären Workspace des Daemons zurück. Das Posten eines `cwd`, das nicht zu einem registrierten Workspace kanonisiert werden kann, gibt `400 workspace_mismatch` zurück.

Ein zweiter Client, der für dieselbe aufgelöste Workspace-Runtime an `/session` postet, erhält `"attached": true` unter dem Standard-`sessionScope: 'single'` — er teilt sich nun die Agent-Sitzung dieser Runtime. Das Weglassen von `cwd` löst sich auf primär auf; die Auswahl eines anderen registrierten Workspaces erstellt oder hängt sich an die separate Standard-Sitzung dieser Runtime an.

### 4. Event-Stream abonnieren (zuerst in einem anderen Terminal)

```bash
SESSION_ID="<from step 3>"
curl -N http://127.0.0.1:4170/session/$SESSION_ID/events
# → id: 1
#   event: session_update
#   data: {"id":1,"v":1,"type":"session_update","data":{"sessionUpdate":"agent_message_chunk","content":{"type":"text","text":"…"}}}
```

Die `data:`-Zeile ist das **vollständige Event-Envelope** — `{id?, v, type, data, originatorClientId?}` — als JSON-String in einer einzigen Zeile. Die ACP-Payload (der `sessionUpdate`-Block in diesem Beispiel) befindet sich innerhalb dieses Envelopes unter `data`. Die SSE-Level-`id:`- / `event:`-Zeilen sind eine Erleichterung für EventSource-Clients; dieselben Werte erscheinen auch im JSON-Envelope, sodass auch Raw-`fetch`-Consumer sie erhalten.

Öffnen Sie dies **vor** dem Senden der Eingabeaufforderung – der SSE-Replay-Puffer hält die letzten 8000 Ereignisse, sodass ein späterer Abonnent über `Last-Event-ID` nachholen kann, aber für den einfachen Fall "eine einzelne Eingabeaufforderung beobachten" ist es am einfachsten, zuerst zu abonnieren und live streamen zu lassen.

Der Stream sendet `session_update` (LLM-Chunks, Tool-Aufrufe, Nutzung), `permission_request` (Tool benötigt Genehmigung), `permission_resolved` (jemand hat abgestimmt), `model_switched`, `model_switch_failed` sowie die terminalen Frames `session_died` (Agent-Kind ist abgestürzt – SSE schließt dann) und `client_evicted` (Ihre Warteschlange ist übergelaufen – SSE schließt dann).

### 5. Senden eines Prompts (zurück im ursprünglichen Terminal)

```bash
curl -X POST http://127.0.0.1:4170/session/$SESSION_ID/prompt \
  -H 'Content-Type: application/json' \
  -d '{"prompt":[{"type":"text","text":"What does src/main.ts do?"}]}'
# → {"stopReason":"end_turn"}
```

Das `curl -N` aus Schritt 4 wird Frames ausgeben, sobald sie eintreffen.

### Optionaler Todo-Stoppschutz

Lang laufende Daemon-Clients können sich für eine begrenzte Fortsetzung entscheiden, wenn die aktuelle Arbeitskette erfolgreich eine Todo-Liste auf oberster Ebene schreibt und dann stoppt, während noch Elemente ausstehend oder in Bearbeitung sind. Fügen Sie dies zu `settings.json` hinzu und starten Sie den Daemon neu:

```json
{
  "experimental": {
    "todoStopGuard": true
  },
  "tools": {
    "todoWrite": {
      "enabled": true
    }
  }
}
```

Die Schutzfunktion fügt maximal zwei aufeinanderfolgende Aufrufe des primären Modells ohne neue Benutzereingabe hinzu. Eine Benutzer-Nachricht mitten im Turn wird zuerst ausgeführt und startet eine neue Stufe mit zwei Versuchen; Wiederholung/Fortsetzung und verwandte Hintergrundergebnisse behalten das Budget der aktuellen Stufe bei. Jeder Aufruf und der endgültige Erschöpfungszustand erscheinen als wiedergebbare `session_update`-Ereignisse mit `_meta.source: "todo_stop_guard"`; die Metadaten enthalten den Versuch und die Anzahl der unfertigen Elemente, aber niemals Todo-Text. Eine eingereihte vollständige Eingabeaufforderung wird ebenfalls zuerst ausgeführt, und bestehende Genehmigungs-/Abbruchregeln bleiben unverändert.

Während eine bewaffnete Kette auf verwandte Hintergrundarbeit wartet, werden feuende Cron-/Loop-Ereignisse und alte Task-Benachrichtigungen zurückgestellt. Wiederkehrende Arbeit ist begrenzt und pro Aufgabe zusammengefasst, bis die Kette nachgibt.

Die Option ist standardmäßig auf `false` gesetzt, erfordert einen Neustart und ist im Safe-Modus, Bare-Modus und Approval-`plan`-Modus deaktiviert. Sie wird nur im Speicher gehalten: Das Laden des Todo-Zustands von der Festplatte oder ein Neustart des Daemons aktiviert sie nicht. Setzen Sie `tools.todoWrite.enabled` in settings.json und starten Sie Qwen Code neu; anschließend muss eine neue normale Eingabeaufforderung ihren eigenen Top-Level-`todo_write` erfolgreich ausführen können. Wiederholungen/Fortsetzungen und das erneute Verbinden eines aktiven Clients behalten die aktuelle Arbeitskette im Speicher bei. Eine erfolgreiche Änderung des Arbeitsverzeichnisses der Sitzung löscht den Zustand, damit ein altes Todo nicht in einem neuen Workspace fortgesetzt werden kann.

## Authentifizierung [#authentication]

Für alles jenseits von Loopback erfordert jede API-Anfrage ein Bearer-Token. Stellen Sie ein stabiles Token für wiederverwendbare Clients bereit, oder starten Sie ohne eines und verwenden Sie das ephemere Token, das der Daemon generiert und ausgibt:

```bash
export QWEN_SERVER_TOKEN="$(openssl rand -hex 32)"
qwen serve --hostname 0.0.0.0 --port 4170
# → uses QWEN_SERVER_TOKEN; generates an ephemeral token if neither token source is supplied
```

Clients senden dann `Authorization: Bearer <token>` bei normalen API-Anfragen — `$QWEN_SERVER_TOKEN`, wenn du einen exportiert hast, oder das beim Start ausgegebene Bearer, wenn der Daemon es generiert hat (dieser Pfad setzt niemals die Umgebungsvariable, also kopiere den Wert aus der Startausgabe). `/health` ist **nur bei gewöhnlichen Loopback-Binds** ausgenommen, damit k8s/Compose-Liveness-Probes innerhalb des Pods keine Credentials benötigen. Bei Non-Loopback-Binds (`--hostname 0.0.0.0` usw.) erfordert `/health` den Token zusammen mit den anderen normalen API-Routen — andernfalls kann ein Angreifer beliebige Adressen abfragen, um die Existenz des Daemons zu bestätigen. Channel-Webhook-Eingangsverkehr ist in jedem Modus separat und verwendet sein konfiguriertes `x-qwen-webhook-secret` anstelle des Daemon-Bearers. Verwende `/capabilities`, um zu überprüfen, ob dein konfigurierter Token End-to-End korrekt ist:

> **Gehärtetes Loopback (`--require-auth`).** Das Standard-Loopback-Verhalten ohne Token ist für einen Single-User-Laptop in Ordnung, aber unsicher auf gemeinsamen Dev-Hosts, CI-Runnern oder Multi-Tenant-Workstations, wo jeder lokale Benutzer `curl 127.0.0.1:4170` ausführen kann. Übergib `--require-auth`, um den Bearer-Token auf jeder normalen API-Route zwingend erforderlich zu machen — einschließlich `/health` und `/capabilities` — auch wenn er an `127.0.0.1` gebunden ist. Channel-Webhook-Eingangsverkehr bleibt unabhängig durch `x-qwen-webhook-secret` authentifiziert. Web-Shell-Dokument- und Asset-Routen bleiben pre-auth; verwende `--no-web`, um sie zu entfernen. Der Boot schlägt fehl, wenn keine Token-Quelle aufgelöst wird, und bei Loopback bedeutet das `--token`, `QWEN_SERVER_TOKEN` oder `--open-with-auth` — letzteres installiert sein eigenes generiertes Token vor dem Boot, sodass `--require-auth --open-with-auth` startet. Die Generierung hängt von der `--hostname`-Schreibweise ab: Loopback-Schreibweisen (`127.0.0.0/8`, `localhost`, `::1`, `[::1]`) generieren niemals, während jede andere Schreibweise — einschließlich eines DNS-Namens, der zufällig auf Loopback auflöst — ein ephemeres Bearer generiert, das `--require-auth` erfüllt und beim Start ausgegeben wird (nur Token, wenn der Socket Loopback gebunden hat), das bei jedem Neustart rotiert, also pinne `--token` oder `QWEN_SERVER_TOKEN` für wiederverwendbare Clients. Mit diesem Flag kann ein **nicht authentifizierter** Client `/capabilities` nicht lesen, um herauszufinden, dass Auth erforderlich ist; die Discovery-Oberfläche ist der 401-Response-Body selbst. Nach der Authentifizierung ist der Tag `caps.features.require_auth` eine Post-Auth-Bestätigung, dass das Deployment gehärtet ist (nützlich für Audit-/Compliance-UIs):
>
> ```bash
> qwen serve --require-auth --token "$(openssl rand -hex 32)"
> # → /health, /capabilities, /session, … all require Authorization: Bearer …
> curl http://127.0.0.1:4170/health
> # → 401
> curl -H "Authorization: Bearer $TOKEN" http://127.0.0.1:4170/capabilities | jq '.features | index("require_auth")'
> # → 13   (or whatever index — non-null after authenticating means the tag is present)
> ```

```bash
# Paste the bearer the daemon printed at startup, or your own QWEN_SERVER_TOKEN.
TOKEN='<printed bearer>'
curl -H "Authorization: Bearer $TOKEN" http://your-host:4170/capabilities
# → {"v":1,"mode":"http-bridge","features":[...],"modelServices":[],"workspaceCwd":"/path/to/your-project"}
# Wrong token → 401
```

Der Token-Vergleich ist Constant-Time (SHA-256 + `crypto.timingSafeEqual`); 401-Responses sind einheitlich für "fehlender Header", "falsches Schema" und "falscher Token", sodass ein Side-Channel sie nicht unterscheiden kann.

`--open-with-auth` ist eine CLI-eigene Bequemlichkeit, keine andere Daemon-Token-Quelle: Es wählt `--token` aus, wenn diese Option definiert ist (auch wenn leer), andernfalls `QWEN_SERVER_TOKEN`, schneidet dann den ausgewählten Wert ab und generiert nur, wenn das Ergebnis leer ist. Der Daemon speichert den generierten Wert nicht persistent oder exportiert ihn als `QWEN_SERVER_TOKEN`; die bestehende interne authentifizierte Kind-Prozess-Übergabe bleibt unverändert. Das Web Shell speichert seine Browser-Kopie nur im `sessionStorage` des empfangenden Tabs; dieser Modus fügt keinen Mechanismus zur Erkennung von Anmeldeinformationen zwischen Tabs oder externen Clients hinzu. Das Token ist nicht unabhängig widerrufbar oder an eine Client-Identität gebunden. Der Besitz gewährt dieselbe Daemon-Autorität wie jedes andere Bearer-Token. Siehe das [Design für den Start einer authentifizierten Web Shell](../design/2026-08-22-serve-open-with-auth.md) und verwandte zukünftige Arbeiten in [#4514](https://github.com/QwenLM/qwen-code/issues/4514).

## HTTPS / TLS (für mobilen / geräteübergreifenden Zugriff) [#https--tls-for-mobile--cross-device-access]

Standardmäßig bedient der Daemon reines HTTP. Das ist auf `localhost` in Ordnung, aber ein Telefon oder Tablet, das eine LAN-IP (`https://192.168.x.x:4170`) erreicht, ist **kein** [sicherer Kontext](https://developer.mozilla.org/en-US/docs/Web/Security/Secure_Contexts) über `http://` — daher blockieren Browser `getUserMedia` (Spracheingabe), WebRTC und andere APIs, die nur in sicheren Kontexten funktionieren. Übergeben Sie `--tls-cert` + `--tls-key`, um die Web Shell über HTTPS bereitzustellen und diese freizuschalten:

```bash
# 1. Install a local CA and trust it (one-time). The mobile device must
#    also trust this CA — mkcert prints where the root cert lives.
mkcert -install

# 2. Generate a cert for your machine's LAN IP. Add localhost / 127.0.0.1 to
#    the SANs too: with `--open`, the daemon rewrites the browser URL to
#    127.0.0.1, so a cert scoped to only the LAN IP would be rejected with
#    ERR_CERT_COMMON_NAME_INVALID. (mkcert names the output after all hosts.)
mkcert 192.168.1.100 localhost 127.0.0.1

# 3. Start the daemon over HTTPS. Non-loopback binds still require a token,
#    and the browser Origin must be allowed through CORS.
qwen serve \
  --hostname 0.0.0.0 \
  --token "$(openssl rand -hex 32)" \
  --tls-cert "./192.168.1.100+2.pem" \
  --tls-key "./192.168.1.100+2-key.pem" \
  --allow-origin "https://192.168.1.100:4170"
# → qwen serve listening on https://0.0.0.0:4170
```

Hinweise:

- **Beide Flags oder keines** — der Start schlägt fehl, wenn nur eines angegeben wird (ein Zertifikat ohne Schlüssel kann keinen HTTPS-Listener starten).
- **TLS ist orthogonal zur Authentifizierung** – HTTPS verschlüsselt den Transport; wenn ein Bearer-Token konfiguriert ist, schützt er normale API-Routen außer `/health` bei einem gewöhnlichen Loopback-Bind. Übergib `--require-auth`, um auch Loopback-`/health` zu schützen. Channel-Webhook-Eingangsverkehr verwendet immer sein eigenes Shared-Secret. Non-Loopback-Binds führen immer ein Token mit oder ohne TLS — das von dir übergebene oder das ephemer, das der Daemon generiert und beim Start ausgibt.
- **Gilt nur für TLS-Terminierung** – keine automatische Generierung, kein ACME / Let's Encrypt. Dies ist eine Erleichterung für LAN/Entwicklung; für internetzugängliche Deployments sollte TLS an einem Reverse Proxy terminiert werden (siehe das Threat Model unten).
- **Channel-Worker wählen den Daemon über `https://` zurück an** – sie müssen daher ebenfalls dem serving-Zertifikat vertrauen. Ein selbstsigniertes Zertifikat (oder eine Fullchain, die ihr eigenes Root enthält) benötigt nichts zusätzliches: der Daemon injiziert es in das `NODE_EXTRA_CA_CERTS` jedes Workers. Der obige mkcert-Flow ist **CA-ausgestellt**, sodass das Leaf allein die Chain nicht verankern kann — exportiere `NODE_EXTRA_CA_CERTS="$(mkcert -CAROOT)/rootCA.pem"` in der Launch-Umgebung des Daemons vor dem Start mit `--channel`. Ein vom Operator gesetzter Wert wird mit dem Daemon-Zertifikat _zusammengeführt_, nicht ersetzt. Ohne ihn startet der Daemon grün, während jeder Channel-Worker in einer `UNABLE_TO_VERIFY_LEAF_SIGNATURE`-Neustartschleife hängt; das Daemon-Log benennt die Lücke beim Boot.
- **Ein IPv6-Wildcard-Bind wird auf dem Loopback zurückgewählt, den dieser Host tatsächlich zuweist** — `--hostname ::` (oder `[::]`) bindet einen IPv6-Socket. (Ein leeres `--hostname` erreicht niemals den Listener: der Boot verweigert es als Operator-Fehler vor dem Binden, sodass eine Compose-Datei mit einem nicht gesetzten `HOSTNAME` lautstark fehlschlägt, anstatt stillschweigend zu wildcarden.) Dieser Socket ist Dual-Stack (Node setzt `IPV6_V6ONLY=0` darauf, daher ändert das `net.ipv6.bindv6only`-Sysctl dies nicht), und beide Loopbacks erreichen ihn normalerweise — aber ein Host ohne IPv4 hat nur `::1`, während ein Host, der `::` bindet aber kein `::1` auf seinem Loopback trägt (zum Beispiel `net.ipv6.conf.lo.disable_ipv6=1`), nur `127.0.0.1` hat. Worker werden an `[::1]` gesendet, wenn dieser Host es zuweist, und sonst an `127.0.0.1`. Ein Serving-Zertifikat für einen IPv6-Wildcard-Bind sollte beide Loopbacks in seinen SANs tragen (`mkcert localhost 127.0.0.1 ::1` deckt es ab); die Boot-Trust-Diagnose prüft die genaue URL, die Worker anwählen werden, und benennt die Lücke. `--hostname 0.0.0.0` bleibt unverändert und benötigt weiterhin `127.0.0.1`.
- **Das Rotieren von `--tls-cert` zur Laufzeit erfordert einen Daemon-Neustart** — der Daemon serviert die Bytes, die er beim Boot gelesen hat, sodass bis zum Neustart neu gestartete Worker neuere Inhalte laden können als der Daemon präsentiert und ihre Handshakes fehlschlagen.

## Web Shell als App installieren

Öffnen Sie im Web Shell des Daemons über einen unterstützten Browser die Aktion **App installieren** oder **Zum Startbildschirm hinzufügen**. Die installierte App öffnet denselben Server in einem eigenständigen Fenster mit dem Namen und Symbol von Qwen Code. Verwenden Sie auf iOS das Freigabemenü des Browsers und **Zum Home-Bildschirm hinzufügen**. Die Verfügbarkeit hängt vom Browser und Gerät ab.

Der Daemon stellt die PWA-Metadaten selbst bereit: `GET /manifest.webmanifest` und `GET /sw.js` sind Routen vor der Authentifizierung (der Browser ruft beide ab, bevor ein Authorization-Header vorhanden ist), und `sw.js` wird mit `Service-Worker-Allowed: /` bereitgestellt, sodass sein Geltungsbereich die gesamte Origin abdeckt. Der Worker speichert nur inhaltsgehashte Vite-Build-Assets zwischengespeichert (Cache-first). Nicht gehashte öffentliche Symbole und das Manifest werden über HTTP revalidiert. API-Aufrufe, Event-Streams und Anfragen mit Authorization-Header verbleiben im Netzwerk.

Verwenden Sie eine vertrauenswürdige HTTPS-Verbindung für ein Telefon oder andere Remote-Geräte; HTTP auf `localhost` oder einer Loopback-Adresse wird für die lokale Entwicklung unterstützt. Einfaches HTTP auf einer LAN-IP-Adresse aktiviert den Service Worker nicht. Siehe die oben genannten TLS-Anweisungen; die Installation umgeht keine Zertifikats- oder Authentifizierungsprüfungen.

Die Installation startet immer die Server-Wurzel. Ein Token, ein Sitzungslink oder ein Workspace in der aktuellen Adresse wird niemals in die Start-URL der App aufgenommen. Möglicherweise müssen Sie das Token in der installierten App erneut eingeben: Sie verwendet den bestehenden Authentifizierungsfluss der Web Shell und fügt keinen dauerhaften Credential-Speicher hinzu.

Der Server muss weiterhin laufen und erreichbar sein. Nachdem der Service Worker aktiviert wurde und die Kontrolle über eine Seite übernommen hat, zeigt das Öffnen der Wurzel oder eines Sitzungslinks bei fehlender Verbindung eine Wiederholungsseite an. In einem Service-Worker-Cache werden keine Konversationen, Dateien, API-Antworten oder Credentials gespeichert. Bestehende HTTP-Fehler stammen weiterhin vom Server. Dieser erste Schritt bietet keine Offline-Arbeit, Web Push oder Benachrichtigungen, wenn die App geschlossen ist. Aktualisierte Worker aktivieren sich sofort mit `skipWaiting()` und `clients.claim()` und ersetzen den vorherigen Worker für offene Tabs ohne erzwungenes Neuladen der Seite. Die Aktivierung entfernt ältere Qwen-Shell-Caches und behält unrelated Caches bei.

Die Installationsmetadaten verwenden die integrierte Qwen Code Identität; Runtime Custom Branding gilt weiterhin innerhalb der Web Shell. Embedded Library Consumer registrieren den Worker nicht. Um die Installation zu entfernen, verwenden Sie die App-Verwaltung Ihres Browsers oder Betriebssystems; um den Service Worker und gespeicherte Site-Daten zu entfernen, verwenden Sie die Website-Einstellungen des Browsers.

## Qwen Live (experimentell)

Qwen Live läuft über die Web Shell auf jeder Plattform: Der Browser-Tab ist das Mikrofon und der Lautsprecher (WS `/live/web`), öffnen Sie also die Web Shell über `https` oder `localhost` für den Mikrofonzugriff. Die native macOS `Qwen Live Host` App ist standardmäßig deaktiviert; um sie zu testen, starten Sie einen macOS-Daemon mit `QWEN_SERVE_LIVE_NATIVE_HOST=1`, was das `/live/host` WebSocket, die `realtime_voice` Fähigkeit und den Host-Download wiederherstellt, wenn Live aktiviert ist. Ohne diesen bleibt ein bereits installiertes `Qwen Live Host.app` nicht verbunden (der Daemon registriert `/live/host` nicht); beenden Sie es und nutzen Sie die Web Shell.

## CLI-Flags

| Flag | Standard | Zweck |
| --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--port <n>` | `4170` | TCP-Port. `0` = vom OS zugewiesener ephemeraler Port. |
| `--hostname <addr>` | `127.0.0.1` | Bind-Schnittstelle. Alles außer Loopback erfordert ein Token; wenn weder `--token` noch `QWEN_SERVER_TOKEN` eines bereitstellen, wird ein ephemerales Token generiert und beim Start ausgegeben. |
| `--local-control` | `false` | Teilen Sie die Web Shell auf einer ausgewählten privaten IPv4-Schnittstelle mit einem widerrufbaren Pairing-Token des Daemons, einem Terminal-QR-Code, der exakten Browser-Origin und best-effort Sleep-Inhibition. Kombinierbar mit `--token`, `--allow-origin` und `--port 0`; kollidiert mit `--no-web` und nicht-standardmäßigen `--hostname`. Verwenden Sie `--local-control-address`, wenn mehrere LAN-Kandidaten verfügbar sind, und fügen Sie `--tls-cert` + `--tls-key` hinzu für Secure-Context-Browser-APIs wie Spracheingabe. |
| `--local-control-address <ip>` | — | Welche LAN-IPv4-Adresse geteilt werden soll, wenn der Host mehr als einen Kandidaten hat. Nur erforderlich, wenn `--local-control` eine mehrdeutige Auswahl meldet. |
| `--token-qr` | — | Gibt den tokenhaltigen QR-Code aus, auch wenn stdout erfasst wird (kein interaktives Terminal) und der Bearer ein vom Operator bereitgestelltes (stabiles) Token ist, das standardmäßig zurückgehalten wird, um stabile Credentials aus gesammelten Logs fernzuhalten. Kann auch über die `serve.tokenQr` Einstellung festgelegt werden, wobei nur User-, System- und System-Default-Scopes beachtet werden; das Flag gewinnt, wenn es übergeben wird. Das Weglassen des Flags ist **nicht** dasselbe wie `--no-token-qr`: Das Weglassen belässt die Standardrichtlinie (QR bei einem interaktiven Terminal oder für ein generiertes Token), während `--no-token-qr` den Quickstart-Token-QR beim Start für diesen Durchlauf auf jedem Quickstart-Pfad unterdrückt, sodass eine persistente Einstellung pro Durchlauf abgelehnt werden kann. Keines davon steuert den Local Control Pairing-QR. |
| `--token <str>` | — | Bearer-Token. Fällt auf die `QWEN_SERVER_TOKEN` Umgebungsvariable zurück (mit entfernten führenden/nachfolgenden Leerzeichen – praktisch für `$(cat token.txt)`). Ein Nicht-Loopback-Bind ohne Quelle generiert ein ephemerales Token. Ein explizit leerer Wert verweigert den Start bei einem Nicht-Loopback-Bind; bei Loopback überschattet er die Umgebungsvariable und wählt den vertrauenswürdigen tokenlosen Modus (oder verweigert vollständig unter `--require-auth`). |
| `--require-auth` | `false` | Verweigert den Start ohne Bearer-Token, auch bei Loopback. Härtet den `127.0.0.1` Entwicklerstandard für gemeinsame Dev-Hosts / CI-Runner / Multi-Tenant-Workstations ab, wo jeder lokale Benutzer den Listener erreichen kann. Dieses Fail-Fast gilt nur für Loopback: Loopback startet nur mit einer seiner drei Tokenquellen – `--token`, `QWEN_SERVER_TOKEN` oder `--open-with-auth`, welches sein eigenes generiertes Token vor dem Boot installiert (Generierung wird bei Loopback unterdrückt) –, während bei einem Nicht-Loopback-Bind das generierte ephemere Token das Flag erfüllt. Steuert `/health` hinter dem Bearer. |
| `--enable-session-shell` | `false` | Aktiviert direkte Session-Shell-Ausführung. Wirksam entweder mit einem konfigurierten Bearer-Token oder im vertrauenswürdigen Loopback-Modus; Aufrufe erfordern weiterhin ein gültiges sessiongebundenes `X-Qwen-Client-Id`. |
| `--tls-cert <path>` | — | Pfad zu einer PEM-Zertifikatsdatei. Serve über **HTTPS** statt HTTP. Muss mit `--tls-key` gepaart werden (Boot schlägt fehl, wenn nur eines angegeben wird). Schaltet Secure-Context-Browser-APIs frei – Spracheingabe (`getUserMedia`), WebRTC – über eine LAN-IP, welche Browser sonst bei plain `http://` blockieren. Nur TLS-Terminierung; keine Auto-Generierung / ACME. Siehe [HTTPS / TLS](#https--tls-for-mobile--cross-device-access) unten. |
| `--tls-key <path>` | — | Pfad zu einer PEM-Privatschlüsseldatei. Muss mit `--tls-cert` gepaart werden. |
| `--max-sessions <n>` | `32` | Obergrenze für gleichzeitige Live-Sessions. Neue `POST /session` Anfragen, die einen neuen Child spawnen würden, geben `503` zurück (mit `Retry-After: 5`), wenn die Grenze erreicht ist; Anhängen an bestehende Sessions wird NICHT gezählt. Auf `0` setzen zum Deaktivieren. Kann auch über `serve.maxSessions` gesetzt werden (nur User-, System- und System-Default-Scopes); das Flag gewinnt, wenn es übergeben wird. Ausgelegt für Single-User / kleine Teams; erhöhen Sie es, wenn Ihre Bereitstellung RAM/FD-Spielraum hat (~30–50 MB pro Session). |
| `--max-total-sessions <n>` | `800` oder abgeleitet | Optionale nicht-negative Ganzzahl daemonweite Obergrenze für neue Session-Erstellung über alle registrierten Workspace-Runtimes hinweg. Gilt für neue Child-Sessions, Session-Wiederherstellung und Branch/Fork-erstellte Sessions; Anhängen an eine bestehende Live-Session verbraucht keinen Slot. Auf `0` setzen für unbegrenzt. Standardmäßig 800, wenn die Registrierungskapazität über 25 liegt (einschließlich der Standard-256). Bei Kapazitäten von 25 oder weniger ist ein Startup- oder wiederhergestellter Workspace unbegrenzt; mehrere leiten das Total aus dem per-workspace Limit und dieser Anzahl ab. Spätere dynamische Registrierung berechnet dies nicht neu. |
| `--max-pending-prompts-per-session <n>` | `5` | Per-Session-Obergrenze für Prompts, die von `POST /session/:id/prompt` akzeptiert, aber noch nicht abgeschlossen wurden, einschließlich gewarteter Prompts und des aktiven Prompts. Die Bridge lehnt Überlauf synchron mit `503`, `Retry-After: 5` und `code: "prompt_queue_full"` ab, bevor sie ein `promptId` zurückgibt. Auf `0` setzen zum Deaktivieren. `branchSession` serialisiert in derselben FIFO, zählt aber nicht gegen dieses Prompt-Limit. |
| `--workspace <path>` | `process.cwd()` | Absoluter Workspace-Verzeichnis, registriert von diesem Daemon. Wiederholen Sie das Flag, um mehrere Workspaces in einem Prozess zu hosten; der erste ist primär und bleibt der Standard, wenn eine Anfrage `cwd` weglässt. Relative Werte werden abgelehnt. Session-Anfragen, deren kanonisches `cwd` nicht registriert ist, geben `400 workspace_mismatch` zurück. |
| `--conversations-dir <path>` | — | Stammverzeichnis für den Arbeitsbereich von Absolute Conversations für eigenständige und Live-Sitzungen. Überschreibt `QWEN_CONVERSATIONS_DIR`; wenn weder gesetzt, wird `~/Documents/Qwen Code/Conversations` verwendet. Wird auch von `qwen daemon start` akzeptiert. Siehe [Arbeitsverzeichnis für Conversations](#conversations-working-directory). |
| `--memory-project-scope <mode>` | `workspace` | Modus zur Partitionierung des Projektgedächtnisses. `workspace` (Standard) schlüsselt das Gedächtnis nach dem exakt registrierten Workspace-Verzeichnis auf, sodass jeder Daemon-Workspace ein eigenes isoliertes Gedächtnis erhält; `git-root` ist der Legacy-Kompatibilitätsmodus, der von Workspaces geteilt wird, die zum selben Git-Root aufgelöst werden. Überschreibt `QWEN_CODE_MEMORY_PROJECT_SCOPE`, wenn angegeben; ein leerer Umgebungsvariablenwert wird als nicht gesetzt behandelt, während ein nicht erkannter, nicht leerer Wert ignoriert wird mit einer einmaligen Warnung und das Legacy-`git-root`-Verhalten beibehält. Der neue Standard migriert kein vorhandenes Git-Root-Projektgedächtnis – verwenden Sie einen expliziten `git-root`-Scope, um diese Einträge während der Migration zu lesen. |
| `--channel <name\|all>` | — | Experimenteller daemon-verwalteter Kanal-Worker. Wiederholen Sie das Flag, um mehrere konfigurierte Kanäle auszuwählen, oder übergeben Sie `all`, um jeden konfigurierten Kanal zu starten. `all` kann nicht mit benannten Kanälen kombiniert werden. Die Werte der ausgewählten Kanäle `cwd` müssen sich auf einen registrierten Workspace auflösen; ein Multi-Workspace-Daemon führt einen Worker pro besitzendem Workspace aus. Der Worker gehört `qwen serve`; stoppen Sie den Daemon, um serve-verwaltete Kanäle zu stoppen. |
| `--max-connections <n>` | `256` | Listener-Ebene TCP-Verbindungslimit (`server.maxConnections`). Begrenzt die Anzahl der Raw-Sockets unabhängig von der Sitzungsanzahl – langsame / Phantom-SSE-Clients werden beim Accept abgewiesen, sobald voll. Erhöhen Sie zusammen mit `--max-sessions`, wenn Ihre Bereitstellung viele SSE-Abonnenten pro Sitzung erwartet. |
| `--memory-budget-mb <n>` | 50% der cgroup/host | Gesamter Speicherbudget in MB für den gesamten Daemon-Prozessbaum. Wenn nicht gesetzt, wird es als 50% des cgroup-Limits oder des Host-Speichers abgeleitet; in beiden Fällen ist der effektive Wert auf den aufgelösten verfügbaren Speicher begrenzt, und sowohl die konfigurierten als auch die effektiven Zahlen werden gemeldet. Es steuert die feste ACP-Partition, die von `--child-heap-mode` ausgewählt wird, und das adaptive Live-Journal-Wachstum; es ist kein gesamtes RSS-Limit: Ein Daemon-weites Wachstumspool, abgeleitet als 5% des effektiven Budgets (begrenzt auf `1024` MB; auf Hosts, die `insufficientMemory` melden, ist der Pool 0 und adaptives Wachstum deaktiviert), wird von jeder Workspace-Bridge geteilt – siehe `--max-journal-bytes`. Aufgelöste Zahlen erscheinen unter `limits.memory` in `GET /daemon/status`, zusammen mit registrierten und lebenden Kind-Anzahlen und beratenden anteiligen Werten pro Kind unter `runtime.memory`. Ein Host, der zu klein für das Minimum ist, meldet `insufficientMemory` anstatt nach oben geklemmt zu werden; da der abgeleitete Anteil 50% beträgt, löst dies bei jedem Host unter ~2 GB aus. Übergeben Sie ein explizites `--memory-budget-mb 1024` auf einem solchen Host, um die abgeleitete Zahl zu überschreiben (das Flag erfordert weiterhin mindestens 1024 MB verfügbaren Speicher, um die Warnung zu umgehen). Muss eine ganze Zahl in `[1024, 1048576]` sein. |
| `--memory-pressure-mode <mode>` | `observe` | Ob der Daemon seine eigene Speichermessung in ein Urteil umwandelt. `observe` (Standard) meldet den Drucklevel unter `runtime.memory.pressure` in `GET /daemon/status` und hebt ein `daemon_memory_pressure`-Issue hervor – ein `warning`, sodass der Gesamt-`status` `ok` verlässt –, wann immer der Level `normal` verlässt. `off` meldet weiterhin jede Zahl, einschließlich des Levels, hebt aber kein Issue hervor, sodass der Gesamt-`status` unverändert bleibt; verwenden Sie es während der Kalibrierung oder wenn Sie auf den Top-Level-Status alarmieren. Der Level ist das schlechtere Verhältnis von zwei Verhältnissen: RSS gegen verfügbaren Speicher (was der cgroup OOM-Killer überwacht) und V8-Heap-Nutzung gegen die Heap-Obergrenze dieses Prozesses. Es deckt nur den Daemon-Root-Prozess ab; vergleichen Sie es mit `runtime.memory.children.rssBytes` für die Kinder. In keinem Modus wird etwas behoben. Eines von `off`, `observe`. |
| `--child-heap-mode <mode>` | `observe` | `off` deaktiviert die Partition; `observe` meldet `limits.memory.childHeap` ohne Änderung des Spawnings; `admit` erzwingt nur die modellierten gleichzeitigen Kind-Anzahl. Experimentelles Opt-in `enforce` gibt außerdem jedem verwalteten ACP-Kind die feste `perChildCeilingMb` Old-Space-Obergrenze und meldet `limits.memory.enforced: true`. Beide Zulassungsmodi können ein geeignetes idle ACP zurückfordern, bevor sie mit `acp_child_capacity_exhausted` ablehnen; Live-Sitzungen bleiben geschützt. Registrierung ist unabhängig von der Kind-Kapazität. Null-Slot-Zulassungskonfigurationen schlagen beim Start fehl. Feste geerbte Node-Heap-Flags werden in `enforce` normalisiert; Prozent-Flags kollidieren und werden abgelehnt. Die Obergrenze begrenzt Old Space, nicht RSS oder MCP-Nachkommen. Kalibrieren Sie Ihre Workload vor dem Aktivieren; eine Null-Ablehnungsanzahl beweist keine Heap-Sicherheit. Modus- und Budgetänderungen erfordern einen Daemon-Neustart; starten Sie mit `admit` neu, um die Heap-Durchsetzung zurückzurollen. |
| `--event-ring-size <n>` | `8000` | Pro-Sitzung SSE-Replay-Ring-Tiefe (#3803 §02 Ziel). Setzt das Backlog, das `GET /session/:id/events` mit `Last-Event-ID: N` zur Verfügung steht. Größer = mehr Reconnect-Spielraum auf Kosten von einigen hundert KB zusätzlichem RAM pro Sitzung. SDK-Clients können zusätzlich ein größeres pro-Abonnent-Backlog-Limit für eine bestimmte Subscription über `?maxQueued=N` anfordern (Bereich `[16, 2048]`, Standard 256). Daemons senden auch einen nicht-terminalen `slow_client_warning` SSE-Frame bei 75% Queue-Füllung, damit Clients drainen / reconnecten können, bevor sie evicted werden. Pre-flight `caps.features.slow_client_warning`. |
| `--compacted-replay-max-bytes <n>` | `4194304` | Pro-Live-Sitzung Byte-Limit für die behaltenen Replay-Events im begrenzten Snapshot, der von `POST /session/:id/load` zurückgegeben wird. Das Limit gilt für `compactedReplay`; das aktuelle in-flight `liveJournal` ist separat begrenzt durch `--max-journal-events` und `--max-journal-bytes` (Baseline-Limits, die adaptives Wachstum erhöhen kann – siehe `--max-journal-bytes`). Werte müssen positive sichere Ganzzahlen sein; ungültige Werte schlagen beim Boot fehl, und die harte Obergrenze ist 256 MiB. Wenn älteres behaltenes Replay fallen gelassen wird, beginnt der Snapshot mit `history_truncated`. Dies begrenzt nicht das On-Disk-Transkript. |
| `--max-journal-events <n>` | `10000` | Pro-Sitzung Baseline-Limit für Replay-Einträge, die im in-flight `liveJournal` für die aktuelle unvollendete Turn behalten werden. Aufeinanderfolgende kompatible Text- oder Thought-Chunks teilen sich einen Eintrag, mit maximal 256 Source-Events pro Eintrag; andere Event-Grenzen bleiben erhalten. Wenn überschritten, versucht der Daemon zuerst adaptives Wachstum (siehe `--max-journal-bytes`); wenn kein Spielraum gewährt wird oder die Gewährung den Overshoot nicht abdeckt, werden die ältesten Einträge fallen gelassen und ein `history_truncated`-Marker wird vorangestellt. Die `truncatedEvents`- und `retainedEvents`-Anzahlen des Markers beschreiben Source-Events. Muss eine positive sichere Ganzzahl sein. Pinning dieses Flags (oder `--max-journal-bytes`) deaktiviert adaptives Wachstum. |
| `--max-journal-bytes <n>` | `8388608` | Pro-Sitzung-Baseline-Byte-Limit für die in-flight `liveJournal`, berechnet aus den serialisierten Quellereignissen, auch wenn kompatible Chunks einen Replay-Eintrag teilen. Wenn eine Runde das Limit überschreitet, erhöht adaptives Wachstum die Limits der Sitzung auf bis zu das Doppelte (bis zu einem harten Pro-Sitzungs-Limit von 256 MiB, begrenzt durch den verbleibenden Pool-Spielraum), während das über alle aktiven Sitzungen des Daemons gewährte Wachstum in einen gemeinsamen Wachstums-Pool passt, der mit 5 % des effektiven Speicherbudgets des Daemons dimensioniert ist — der Wert `--memory-budget-mb`, wenn angegeben, begrenzt auf aufgelösten verfügbaren Speicher, andernfalls 50 % des automatisch erkannten Speichers (siehe `--memory-budget-mb`) — begrenzt auf `1024` MB; auf Hosts, die `insufficientMemory` melden, ist der Pool 0 und adaptives Wachstum ist deaktiviert. Wachstum erfolgt bei Bedarf und nur soweit der Pool es erlaubt; wenn es abgelehnt wird, der Pool erschöpft ist oder ein Zuschuss die Überschreitung nicht deckt, werden die ältesten Einträge ganz verworfen (mindestens ein Eintrag wird immer behalten), sodass der behaltene Schwanz viel kleiner als das Limit sein kann. Das Pinning dieses Flags (oder `--max-journal-events`) deaktiviert adaptives Wachstum. Muss eine positive sichere Ganzzahl sein. Standardmäßig 8 MiB. |
| `--mcp-client-budget <n>` | — | Positive Ganzzahl-Limit für aktive MCP-Clients. Wenn `mcp_workspace_pool` advertised wird, sind das Limit und die Transports pro Workspace-Runtime geteilt; wenn das Tag fehlt, erzwingt der Legacy-Pro-Sitzungs-Manager es. Kombinieren mit `--mcp-budget-mode`. Wenn nicht gesetzt, keine buchführungsgesteuerte Durchsetzung (aber `GET /workspace/mcp` meldet weiterhin `clientCount`). Unterscheidet sich von claude-code's `MCP_SERVER_CONNECTION_BATCH_SIZE`, das Start-Konkurrenz statt totaler aktiver Clients steuert. Pre-flight `caps.features.mcp_guardrails` und `caps.features.mcp_workspace_pool`. |
| `--mcp-budget-mode <m>` | `warn` / `off` | Wie `--mcp-client-budget` durchgesetzt wird. `warn` (Standard, wenn Budget gesetzt): keine Ablehnung, Snapshot's `budgets[0].status` wechselt zu `warning` bei ≥75 % des Budgets. `enforce`: Verbindungen über dem Limit werden abgelehnt, pro-Server-Zelle zeigt `disabledReason: 'budget'`, deterministisch nach `mcpServers` Deklarationsreihenfolge. `off` (Standard, wenn Budget nicht gesetzt): reine Observability. Boot lehnt `enforce` ohne Budget ab. |
| `--external-tool-guard-mode <m>` | `off` | Verwaltete ACP externe Vor-Ausführungs-Richtlinie. `off` tätigt keine Provider-Aufrufe und advertisiert keine Fähigkeit. `required` lässt den Start fehlschlagen, es sei denn, ein kompatibler Provider schließt den v1-Handshake ab, dann schlägt jede unterstützte Top-Level-Tool-Invocation geschlossen fehl, es sei denn, ihre einzelne Prepare-Anfrage ist erlaubt. |
| `--external-tool-guard-endpoint <url>` | — | Origin-only Loopback HTTP(S)-Provider-URL verwendet im `required` Modus, zum Beispiel `http://127.0.0.1:8787`. Pfade, URL-Credentials, Redirects, Nicht-Loopback-Hosts und Proxy-Routing werden nicht akzeptiert. |
| `--external-tool-guard-timeout-ms <n>` | `3000` | Ganzzahl `100..30000`; gilt unabhängig für den Start-Handshake und jede Prepare-Anfrage. |
| `--http-bridge` | `true` | Stage 1 Modus: Produktion versucht, ein primäres `qwen --acp` Kind vorzuheizen für Kompatibilität und wiederholt bei erster Nutzung nach Fehler, während jedes vertrauenswürdige sekundäre Kind ein Kind bei Bedarf starten kann. Sitzungen, die auf eine Runtime zielen, multiplexen auf ihr Kind via ACP `newSession()`; unvertrauenswürdige Sekundäre können ACP nicht starten. Stage 2 natives In-Process wird später verfügbar. |
| `--initialize-timeout-ms <n>` | `10000` | ACP Kind-Anfrage-Timeout, einschließlich des `initialize` Handshakes (ms). Muss eine positive Ganzzahl bis `2147483647` sein. Werte über der JS-Timer-Obergrenze (`2^31-1`) werden beim Boot abgelehnt, weil Node sie stillschweigend auf 1 ms komprimiert. Cold-Container-Deployments, die zusätzlichen Spielraum für Kind-Start benötigen, können dies erhöhen; derselbe Wert regiert `newSession`, Workspace-Status-Polls und andere ACP ext-method Deadlines. |
| `--session-restore-timeout-ms <n>` | `60000` | ACP Sitzung Load/Resume Deadline in Millisekunden. Muss eine positive Ganzzahl bis `2147483647` sein; `0` ist ungültig. Wenn weggelassen, ist der Standard 60 Sekunden, erhöht auf explizit geliefertes `--initialize-timeout-ms`, wenn dieser Wert größer ist; ein kürzerer Initialize-Timeout senkt nie das Restore-Budget. Das SDK und Web Shell fügen 10 bzw. 15 Sekunden Client-Spielraum hinzu. Ein Timeout liefert retryable `504 session_restore_timeout` zurück; es impliziert nicht, dass der Daemon selbst beendet wurde. |
| `--allow-origin <pat>` | — | T2.4 ([#4514](https://github.com/QwenLM/qwen-code/issues/4514)). Cross-Origin-Allowlist für Browser-Clients. Wiederholbar. Jeder Wert ist `*` (jeder Origin — auf Loopback-Binds lehnt Boot ab, wenn kein Bearer-Token konfiguriert ist; auf Nicht-Loopback-Binds erfüllt ein generiertes ephemeres Token diese Guards, sodass die Ablehnungen loopback-only sind; `--require-auth` auf Loopback wird empfohlen, damit `/health` ebenfalls bearer-gated ist, da es auf Loopback standardmäßig pre-auth ist; die Web Shell statischen Assets bleiben in jedem Modus pre-auth, also übergeben Sie `--no-web`, um sie zu entfernen) oder eine kanonische URL-Origin (`<scheme>://<host>[:<port>]`, kein trailing slash / path / userinfo / query). Eine kanonische **Loopback**-Origin darf `:*` für den Port verwenden (`<scheme>://<loopback-host>:*`, zum Beispiel `http://127.0.0.1:*`), um diesen Host auf jedem Port zuzulassen; es erfordert ein Bearer-Token, matcht den Host exakt (`127.0.0.1`, `localhost` und `[::1]` sind unterschiedliche Einträge) und wird sowohl vom REST CORS Matcher als auch vom WebSocket CSRF Gate beachtet. Ohne Token müssen HTTP(S)-Origins auf Loopback-Binds Loopback sein; auf Nicht-Loopback-Binds erfüllt das generierte Token denselben Guard. Remote HTTP(S)-Origins authentifizieren sich mit dem Bearer auf jeder API-Route; die pre-auth Ausnahmen sind nur die Web Shell Dokument-/Asset-Routen, die MCP App Sandbox, der Channel Webhook Ingress, der sich mit seinem eigenen `x-qwen-webhook-secret` authentifiziert, und `/health` auf Loopback-Binds (bearer-gated anderswo). Browser-Erweiterungen behalten tokenless Zugriff lokal. Host- und Subdomain-Wildcards (`https://*.example.com`) sind bewusst nicht unterstützt — listen Sie jeden Host explizit auf, oder verwenden Sie `*` mit einem konfigurierten Token (und `--require-auth` für vollständige Härtung); die obige Loopback-Port-Wildcard ist die einzige Wildcard-Form. Matched Origins erhalten CORS Response Headers (`Access-Control-Allow-Origin`, `Vary: Origin`, methods, headers, max-age und exposed `Retry-After`); unmatched Origins erhalten weiterhin ein 403 mit derselben Hülle wie heute's Wall. `Origin: null` (sandboxed iframes, file:// docs) wird immer abgelehnt, auch unter `*`. Pre-flight via `caps.features.allow_origin`. Loopback self-origin Hits sind unberührt. |
| `--web` / `--no-web` | `true` | Serve die gebaute Web Shell SPA am Daemon Root (`GET /`, `/assets/*`, `/manifest.webmanifest`, `/sw.js` und `GET /session/<id>` Dokument-Navigationen). Diese Entry Points sind registriert **vor** dem Bearer-Auth Gate — ein Browser kann kein Token an eine `<script>` Subresource oder eine Address-Bar Navigation anhängen, und die Shell trägt keine Secrets. API Requests folgen der normalen Autoritätsrichtlinie des Daemons: konfigurierte Tokens gate normale API Routen außer Loopback `/health`, es sei denn `--require-auth` ist gesetzt, Channel Webhook Ingress verwendet immer sein eigenes Shared Secret, und der tokenless trusted-loopback primary Listener hat vollen Operator-Zugriff. Die SPA Deep-Link Fallback für alle anderen Pfade sitzt hinter dem Bearer Middleware. Auf Nicht-Loopback-Binds notiert eine einzeilige stderr Warnung, dass die UI ohne Auth erreichbar ist. Verwenden Sie `--no-web` für einen API-only Daemon. Keine Wirkung, wenn der Build die Web Shell Assets auslässt (der Daemon loggt eine Breadcrumb und läuft API-only). |
| `--open` | `false` | Nach dem Start des Listeners wird die Web Shell im Standardbrowser unter der Daemon-URL geöffnet (mit angehängtem `#token=` als URL-Fragment, wenn ein Token aufgelöst wurde – konfiguriert oder generiert –, da Fragmente niemals an den Server gesendet werden und so das Token aus Zugriffsprotokollen und Referer-Headern ferngehalten wird). Keine Aktion bei `--no-web` oder in headless-/CI-/SSH-Umgebungen, in denen kein Browser verfügbar ist. |
| `--open-with-auth` | `false` | Öffnet die Web Shell mit Bearer-Authentifizierung über Loopback. Erfordert eine aktivierte Web Shell und erstellte Assets. Wiederverwendet einen konfigurierten Token oder generiert einen 256-Bit-Bearer-Token für die Prozesslebensdauer und übergibt ihn im Fragment der Web Shell. In Umgebungen ohne Browser wird die manuelle URL mit Secret ausgegeben. Andere Clients benötigen stattdessen denselben explizit konfigurierten gemeinsamen Token. |

> **Einschränkungen des Speicher-Projektumfangs.**
>
> - **Daemon vs. Standalone CLI.** Die Flag oder die Daemon-Startumgebung legt einen eingefrorenen Geltungsbereich für jede Laufzeitumgebung fest, die diesem Daemon gehört. Ein Workspace `.env` oder `settings.env` kann dies nicht für einen einzelnen registrierten Workspace überschreiben. Eine Standalone-`qwen` TUI verwendet standardmäßig weiterhin den Git-Root-Geltungsbereich; um beide Einstiegspunkte konsistent zu halten, exportieren Sie `QWEN_CODE_MEMORY_PROJECT_SCOPE` in der Shell- oder Dienstumgebung, die sie startet.
> - **Namenskonflikte bei Verzeichnissen.** Der Speicherschlüssel wird durch `sanitizeCwd` abgeleitet, wobei jedes nicht-alphanumerische Zeichen durch `-` ersetzt wird. Geschwisterverzeichnisse, die sich nur in der Interpunktion unterscheiden (z. B. `feature_1` und `feature-1`), werden auch unter `workspace` Geltungsbereich demselben Speicherzeichnis zugeordnet. Vermeiden Sie solche Namensgebungen, wenn Sie sich auf die Workspace-Isolation verlassen.
> - **Normalisierung unterscheidet sich zwischen Flag und Env-Var.** Die Umgebungsvariable wird beschnitten und in Kleinbuchstaben umgewandelt (`"  Workspace  "` funktioniert); die CLI-Flag wird von yargs `choices` groß-/kleinschreibungsabhängig verglichen (`--memory-project-scope Workspace` wird abgelehnt). Verwenden Sie Kleinbuchstabenwerte beim Kopieren zwischen beiden.

### Integrierter Git-Umzugsschutz des Daemons

Jede verwaltete Daemon-ACP-Sitzung wendet einen integrierten Pre-Execution Guard für Modell-Shell-Befehle an, unabhängig von `--external-tool-guard-mode` und ohne Capability-Anzeige. Der Daemon besitzt den gebundenen Workspace und das aktuelle effektive Arbeitsverzeichnis der Sitzung; beide werden aus vertrauenswürdigem Sitzungsstatus bereitgestellt und niemals vom ACP-Kind akzeptiert.

Der Guard überprüft die Tools, die eine Shell-Befehlszeile ausführen — `run_shell_command` und `monitor` — und verweigert einen mutierenden Git-Befehl vor der Ausführung, wenn dessen Repository-Speicherort außerhalb des effektiven Arbeitsverzeichnisses der Sitzung aufgelöst wird. Eine Verlagerung wird für literale Formen von `git -C <path>`, `git --git-dir[=]<path>`, `git --work-tree[=]<path>`, führende `GIT_DIR`/`GIT_WORK_TREE`/`GIT_COMMON_DIR`/`GIT_INDEX_FILE`-Zuweisungen (auch wenn sie über `export`/`declare`/`readonly` vorgenommen werden, die sie in der Umgebung jedes späteren Befehls in der Kette beibehalten), wrapper-Flags zur Verschiebung des Verzeichnisses (`env -C`, `sudo -D`) sowie `cd`-, `pushd`- oder `popd`-Builtins weiter vorne in derselben Befehlskette erkannt. Gängige Wrapper-Präfixe (`sh -c`, `bash -c`, `eval`, `sudo`, `nohup`, `timeout`, `exec`, `command`, `builtin`, `env`, pfadqualifizierte `git`-Binärdateien und `{ …; }`-/`! …`-Shell-Syntax) werden entfernt, sodass dieselbe Richtlinie auf den inneren Git-Aufruf angewendet wird, und `$(…)`- oder Backtick-Substitutionskörper werden als eigenständige Befehle analysiert.

Ein Sub-Agent, der an seinen eigenen Worktree gebunden ist, wird auf diesen Worktree begrenzt, nicht auf das Verzeichnis der Sitzung; ein Shell-Aufruf, dessen Ausführungsverzeichnis der Daemon nicht bestimmen kann, wird verweigert.

Relative Ziele werden vom effektiven Startverzeichnis des Befehls aus aufgelöst (`arguments.directory`, falls vorhanden, andernfalls das aktuelle effektive Arbeitsverzeichnis der Sitzung) nach kanonischer Pfadauflösung, einschließlich `.git`-Gitfile-Umleitungen, Symlinks und administrativer Verzeichnisse pro Worktree. Ein verlagertes Ziel, das vor der Ausführung nicht vollständig aufgelöst werden kann — ein dynamisches Ziel (`$VAR`, Backticks, `~`, Globs), ein noch nicht existierender Pfad oder ein unlesbarer Indirektionsmechanismus — wird für mutierende oder nicht klassifizierbare Unterbefehle verweigert. Ein verlagertes Ziel, das nicht aufgelöst werden kann, wird unabhängig vom Unterbefehl verweigert — auch bei schreibgeschützten. Verlagerte Befehle, deren Unterbefehl zu einer kleinen geprüften Menge schreibgeschützter Operationen gehört (`rev-parse`, `cat-file`), bleiben erlaubt, sobald das Ziel aufgelöst ist, es sei denn, der Befehl führt konfigurierte `-c`-Konfigurationen aus, die Befehle ausführen, oder er enthält ein `--output`-, `--textconv`- oder `--filters`-Flag: Diese schreiben eine Datei oder führen die konfigurierten Treiber des Ziel-Repositorys aus. Befehle ohne erkannte Verlagerung behalten ihr bisheriges Verhalten bei. Verweigerungen sind endgültig und werden dem Modell als `Daemon shell guard denied a mutating Git command…` für einen aufgelösten, dynamischen oder nicht auflösbaren Repository-Speicherort gemeldet, und als `Daemon shell guard denied a shell command…`, wenn der Befehl nicht geparst werden konnte, seine Nutzlast nicht aufgelöst werden konnte oder ein nicht erkanntes Programm einen verlagerten Git-Befehl ausführen könnte.

Der Guard ist zuverlässig gegen Git-Verlagerungen, die in den oben genannten literalen Formen geschrieben sind — dem falsch adressierten Befehl, für den diese Kontrolle existiert — und ist **best-effort, keine Grenze**, gegenüber Shell-Text, der darauf abzielt, ihn zu umgehen: Konstruktionen, die die Verlagerung vor einem statischen Leser verbergen, können durchkommen, und neue werden weiterhin gefunden. Gewähren Sie einem Daemon aufgrund davon kein breiteres Vertrauen. Er interpretiert keine Skriptdateien, verfolgt keine Umgebungsvariablenwerte über Befehle hinweg und analysiert keine Heredoc-Körper (Git-förmiger Text innerhalb eines Heredocs kann verweigert werden, obwohl die Shell ihn nie ausführt). `/fork` und agentengestützte Workspace-Speicherkommandos remember/dream bleiben unter dem eingebauten Guard verfügbar; sie sind nur eingeschränkt, während der unten beschriebene externe Anbietermodus aktiv ist. Ein optionaler externer Tool-Guard bleibt eine zusätzliche Richtlinie und erhält dieselbe Anfrage erst, nachdem die eingebaute Richtlinie sie genehmigt hat.

### Erforderlicher externer Tool Guard

Dieses Opt-in ist für verwaltete ACP-Bereitstellungen gedacht, die eine externe Erlaubnis-/Verweigerungsentscheidung an der letzten Tool-Executor-Grenze benötigen. Es ist vollständig deaktiviert, es sei denn, `--external-tool-guard-mode=required` ist vorhanden:

```sh
export QWEN_CODE_EXTERNAL_TOOL_GUARD_TOKEN='replace-with-local-secret'

qwen serve \
  --external-tool-guard-mode=required \
  --external-tool-guard-endpoint=http://127.0.0.1:8787 \
  --external-tool-guard-timeout-ms=3000
```

Der Anbieter muss `POST /v1/handshake` und `POST /v1/prepare` offenlegen, `Authorization: Bearer <token>` verlangen, JSON zurückgeben, den bereitgestellten Nonce oder die Anfrage-ID wiederholen und Protokollversion `1` verwenden. Das Token muss nicht leer sein, höchstens 8192 UTF-16-Codeeinheiten lang sein und darf keine Steuerzeichen enthalten. Anfragen sind auf 1 MiB begrenzt, Antworten auf 64 KiB und optionale Verweigerungsgründe auf 500 UTF-16-Codeeinheiten ohne Steuerzeichen. Eine erfolgreiche Prepare-Antwort lautet:

```json
{ "protocolVersion": 1, "requestId": "<echo>", "allowed": true }
```

Eine Verweigerung verwendet `allowed:false` und kann eine kurze `reason` hinzufügen. Für jede unterstützte Top-Level-Tool-Aufruf, der die bestehenden Berechtigungs- und `PreToolUse`-Gates passiert und die letzte Ausführungsgrenze erreicht, sendet Qwen Code eine Prepare-Anfrage und wiederholt sie niemals. Eine frühere Berechtigungs-/Hook-Verweigerung sendet keine Prepare-Anfrage. Timeout, Abbruch, Transportfehler, fehlerhafte oder nicht übereinstimmende Antworten und explizite Verweigerungen verhindern, dass der Executor ausgeführt wird. Jeder gestartete ACP-Kanal muss außerdem bestätigen, dass er den erforderlichen Callback installiert hat; eine fehlende oder inkompatible Bestätigung lehnt den Kanal vor der Session-Erstellung ab. Die Anbieteranfrage enthält `sessionId`, `promptId`, `toolCallId`, kanonische `toolName` und finale `arguments`; `toolCallId` ist ein Korrelationslabel, keine Authentifizierungsidentität oder eigenständiger Idempotenzschlüssel.

Finale Argumente können sensible Anwendungsdaten enthalten. Behandeln Sie sie entsprechend in Anbieterprotokollen und Audit-Speichern.

`PreToolUse`-Hooks laufen vor dieser finalen Executor-Entscheidung. Der Required-Guard-Modus autorisiert oder sandboxt kein Hook-Verhalten; Bereitstellungen, die eine Grenze um jede mögliche Seitwirkung benötigen, müssen Hooks deaktivieren oder ihre Implementierungen separat reglementieren.

Aktionen von Schrägstrich-Befehlen werden ebenfalls vor der Modell-/Tool-Planung ausgeführt und sind keine Guard-Aufrufe. Einige integrierte Befehle können Dateien oder Einstellungen direkt ändern. Eine verwaltete Bereitstellung, die eine Grenze für alle Effekte benötigt, muss Eingaben von Schrägstrich-Befehlen ablehnen oder jeden nicht genehmigten Befehl über `slashCommands.disabled` oder `--disabled-slash-commands` deaktivieren.

Der v1-verwaltete Umfang umfasst Top-Level-Tools, die von einem aktiven verwalteten Prompt im Vordergrund aufgerufen werden. Verschachtelte oder delegierende `agent`, `workflow`, `create_sub_session`, `send_message`, direkte `/fork` sowie agentengestützte Workspace-Memory-Funktionen (remember/dream) werden abgelehnt, während der erforderliche Modus aktiv ist. Ein Start eines Top-Level-Hintergrund-Shells oder Monitors ist weiterhin ein einzelner geschützter Aufruf, und seine endgültigen Argumente erreichen den Anbieter, aber diese Funktion autorisiert den Prozess nicht kontinuierlich und fügt kein Audit-Protokoll für den Prozessabschluss hinzu; eine Richtlinie, die den Abschluss im Vordergrund erfordert, sollte solche Formen ablehnen. Geschützte MCP-Aufrufe deaktivieren auch die automatische Wiederverbindung/Wiederholung nach einem Transportfehler. Nach einem erfolgreichen Startup-Handshake bewirbt `/capabilities` `external_tool_guard`; dessen Abwesenheit bedeutet, dass Clients die Durchsetzung nicht voraussetzen dürfen.

Diese Funktion autorisiert keine expliziten Daemon-REST/ACP-Verwaltungsaufrufe; diese verwenden weiterhin die vorhandene Authentifizierung und Routenverträge des Daemons. Sie macht auch ein erlaubtes Tool oder einen Shell-Befehl nicht deterministisch und isoliert deren Internals nicht; verwaltete Bereitstellungen müssen die Anbieterentscheidung mit ihrer normalen Tool-Richtlinie und Isolationsgrenze kombinieren.

> **Dimensionierung der Lastparameter.** `--max-sessions` ist die Obergrenze für neue Sitzungen pro Workspace. `--max-total-sessions` ist die Obergrenze für neue Sitzungen daemonweit; wenn weggelassen, beträgt der Standardwert 800 bei der Standard-Registrierungskapazität von 256. Drei weitere Ebenen begrenzen ebenfalls die Last — bei der Dimensionierung für eine Hochparallelitäts-Bereitstellung sollten sie gemeinsam angepasst werden:
>
> - **Listener-Ebene**: `--max-connections` / `server.maxConnections=256` begrenzen rohe TCP-Verbindungen (Backpressure bei langsamen Clients).
> - **Sitzungsbezogene Abonnenten**: Der EventBus begrenzt SSE-Abonnenten standardmäßig auf 64 pro Sitzung; der 65. Client erhält ein terminales `stream_error` und wird geschlossen.
> - **Sitzungsbezogene Prompt-Zulassungen**: `--max-pending-prompts-per-session=5` begrenzt die Anzahl der gewarteten + aktiven Prompts, die für eine Sitzung akzeptiert werden. Bei Überlauf wird `503` mit `Retry-After: 5` zurückgegeben.
> - **Daemonweite neue Sitzungen**: `--max-total-sessions=N` begrenzt die Erstellung neuer Sitzungen daemonweit. Bei Überlauf wird dieselbe `session_limit_exceeded`-Form mit `scope: "total"` zurückgegeben.
> - **Rückstau pro Abonnent**: Eine Warteschlange mit 256 Frames pro SSE-Client; ein Client, der die Kapazität überschreitet, erhält einen terminalen `client_evicted`-Frame und wird geschlossen (ein langsamer Consumer kann den Daemon nicht blockieren).
>
> Diese Grenzen interagieren: Jede Laufzeitumgebung wird durch `--max-sessions` begrenzt, während `--max-total-sessions` ihre Gesamtsumme begrenzt. Die effektive Sitzungsobergrenze ist das Minimum aus jeder endlichen daemonweiten Grenze und der aggregierten grenze pro Laufzeitumgebung (behandeln Sie diese Aggregat als unbegrenzt, wenn die Grenze pro Workspace unbegrenzt ist). Wenn weder eine endliche Grenze vorhanden ist — was bei der Standard-Registrierungskapazität `--max-total-sessions 0` erfordert — gibt es keine endliche Sitzungsobergrenze. Eine endliche Obergrenze × 64 Abonnenten × 256 Frames ist der Worst-Case-Speicherbedarf in der EventBus-Ebene; Multiplizieren Sie dies mit `--max-pending-prompts-per-session`, um die akzeptierte Prompt-Arbeit in der Zulassungsebene zu begrenzen. Die Standard-Dimensionierung geht von Einzelbenutzer-/Kleinteam-Last aus; erhöhen Sie schrittweise (und überwachen Sie RSS) für größere Bereitstellungen.

> **MCP-Client-Guardrails (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14).** Ein Workspace, der 30 MCP-Server in `mcpServers` deklariert, startet 30 Clients ohne Obergrenze, es sei denn, du setzt eine. `--mcp-client-budget=N` begrenzt die Live-MCP-Client-Anzahl; `--mcp-budget-mode={enforce,warn,off}` wählt das Verhalten. Standard ist `warn`, wenn ein Budget gesetzt ist (Snapshot zeigt die Warnung, aber kein Client wird abgelehnt — nützlich zum Messen der realen Fanout vor dem Umschalten auf Enforcement). Abgewiesene Server im `enforce`-Modus erhalten `disabledReason: 'budget'` in ihrer Pro-Server-Zelle, und die `budgets[0]`-Zelle zeigt `status: 'error'` + `errorKind: 'budget_exhausted'`. Slot-Reservierung erfolgt nach Servername und übersteht Reconnects / Discovery-Timeouts — ein abgelehnter Server kann einem gesunden keinen Slot wegnehmen.
>
> **Aktueller Scope ist Capability-getrieben.** Wenn `mcp_workspace_pool` vorhanden ist, teilen sich alle Sessions in einer Workspace-Runtime seinen MCP-Transport-Pool und Budget-Controller; `GET /workspace/mcp` emittiert `scope: 'workspace'`. Ein zweiter Workspace hat einen unabhängigen Pool und Budget. Wenn der Tag fehlt (einschließlich `QWEN_SERVE_NO_MCP_POOL=1`), verwendet der Daemon den Legacy-Pro-Session-`McpClientManager` und emittiert `scope: 'session'`; in diesem Fallback kann jede der N Sessions das konfigurierte Limit verbrauchen.
>
> ```sh
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=warn
> # later, after telemetry shows your real-world distribution:
> qwen serve --mcp-client-budget=10 --mcp-budget-mode=enforce
> ```
>
> Dies ist **nicht** dasselbe wie die `MCP_SERVER_CONNECTION_BATCH_SIZE` von claude-code (die die Startup-Parallelität begrenzt); sie sind orthogonal. Clients müssen auf `mcp_workspace_pool` verzweigen, nicht allein von der Protokollversion auf einen Scope schließen.
>
> **Push-Events (Issue [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 14b).** SDK-Clients, die `GET /session/:id/events` abonniert haben, erhalten typisierte Frames, wenn Budget-Schwellen überschritten werden — `mcp_budget_warning` (synthetisch, feuert einmal pro aufwärtsgerichteter 75%-Überschreitung mit Hysterese-Neubewaffnung bei 37,5 %, beworben über `mcp_guardrail_events`) und `mcp_child_refused_batch` (zusammengefasst einmal pro Discovery-Pass im `enforce`-Modus; Länge-1 aus `readResource`-Lazy-Spawn-Ablehnung). Der Snapshot unter `GET /workspace/mcp` ist weiterhin die Source-of-Truth für den Zustand nach einem Reconnect; Events sind Änderungs-Flanken. Nützlich beim Dashboarden in Echtzeit ohne Polling.

## Standard-Bereitstellungs-Bedrohungsmodell [#default-deployment-threat-model]

- **Nur Loopback** — `127.0.0.0/8`, `localhost` oder `::1`; keine Authentifizierung erforderlich.
- **`localhost` wird einmal aufgelöst, gepinnt und nach dem Listen überprüft** — wenn seine tatsächliche Listener-Adresse außerhalb von `127.0.0.0/8` oder `::1` liegt, schließt der tokenlose Start den Listener und schlägt fehl.
- **`--hostname 0.0.0.0` erfordert ein Token** – der Start wird ohne Token verweigert.
- **`LOOPBACK_BINDS` umfasst IPv6** – `::1` und `[::1]` gelten für die Keine-Token-Regel als Loopback.
- **Host-Header-Allowlist** — bei **Loopback**-Binds prüft der Daemon, ob `Host:` mit `localhost:port` / `127.0.0.1:port` / `[::1]:port` / `host.docker.internal:port` oder der exakten gebundenen Loopback-Adresse und Port übereinstimmt (Groß-/Kleinschreibung gemäß RFC 7230 §5.4 ignoriert), um sich gegen DNS-Rebinding zu verteidigen. Beim Lauschen auf Port 80 oder 443 werden die entsprechenden portlosen Formen ebenfalls akzeptiert, da Browser scheme-default Ports weglassen. Dies unterstützt den vollständigen IPv4-Loopback-Bereich (`127.0.0.0/8`), ohne unrelated Hosts zuzulassen. **Non-Loopback-Binds (`--hostname 0.0.0.0`) umgehen die Host-Allowlist absichtlich** — der Operator hat die Angriffsfläche gewählt, daher ist das Bearer-Token-Gate die einzige Authentifizierungsebene für normale API-Routen; Reverse Proxies / SNI / Client-Zertifikats-Pinning liegen in der Verantwortung des Operators, nicht des Daemons. Wenn Sie Host-basierte Isolation auf einem Non-Loopback-Bind benötigen, beenden Sie TLS + prüfen Sie Host an einem Front-Proxy.
- **CORS lehnt standardmäßig jeden Browser-Origin ab** — gibt `403` JSON zurück. Übergeben Sie **`--allow-origin <pattern>`** (wiederholbar, T2.4 #4514), um bestimmte Browser-Origin zuzulassen. Jeder Wert ist entweder das Literal `*` (jeder Origin — bei einer **Loopback**-Bindung wird der Start verweigert, wenn kein Bearer-Token konfiguriert ist, während eine Nicht-Loopback-Bindung startet, weil die Token-Generierung eines bereitstellt; `--require-auth` auf Loopback wird für vollständige Härtung empfohlen, da `/health` auf Loopback standardmäßig vor der Authentifizierung bleibt — beachten Sie, dass die statischen Web Shell-Assets (`/`, `/assets/*`, `/manifest.webmanifest`, `/sw.js`, `/session/:id`, `/plugins`, `/channels`, `/live`, `/scheduled-tasks`, `/goals` und `/settings` Dokumentnavigationen) in jedem Modus vor dem Bearer eingebunden werden und auch unter `--require-auth` vor der Authentifizierung bleiben, verwenden Sie also `--no-web`, wenn die verbleibende Browser-Oberfläche relevant ist) oder einen kanonischen URL-Origin (`<scheme>://<host>[:<port>]`, ohne abschließenden Schrägstrich / Pfad / Userinfo). Ein Loopback-Host kann stattdessen ein Port-Wildcard verwenden (`<scheme>://<loopback-host>:*`); dies erfordert ein konfiguriertes Bearer-Token (der Start wird ohne dieses verweigert), stimmt mit Schema und Host exakt überein (`127.0.0.1`, `localhost` und `[::1]` sind unterschiedliche Einträge) und ist die einzige Wildcard-Form neben der nur für REST verfügbaren `*`. Bei einer **Loopback**-Bindung ohne Token müssen HTTP(S)-Einträge einen Loopback-Host verwenden; eine Nicht-Loopback-Bindung trägt immer ein Token — bereitgestellt oder generiert — gerade weil remote gehostete Browser-Origin Code über die Operator-API als Daemon-Benutzer ausführen können. Explizite Browser-Erweiterungs-Origin behalten ihren tokenlosen lokalen Automatisierungspfad. Abgestimmte Origin erhalten ordnungsgemäße CORS-Antwortheader (`Access-Control-Allow-Origin: <echoed>`, `Vary: Origin`, plus Standard-Methoden / Header / max-age und exponierte `Retry-After`); nicht abgestimmte Origin erhalten weiterhin eine 403 mit demselben Umschlag wie die Standardwand. `caps.features.allow_origin` wird bedingt advertised, damit SDK-/Webui-Clients vorab prüfen können, ob der Daemon Cross-Origin-Anfragen ehrt, bevor er sie stellt. Beispiel: `qwen serve --allow-origin http://localhost:3000 --allow-origin http://localhost:5173`. Loopback-Self-Origin-Treffer (z. B. die Web Shell UI) sind nicht betroffen — ein separates Origin-Strip-Shim behandelt sie unabhängig von `--allow-origin`. Die Same-Origin-**HTTP**-Anfragen des integrierten Remote Web Shell funktionieren ebenfalls ohne `--allow-origin`: Auf einem primären Listener außerhalb von Loopback wird ein `Origin`, das gleich dem direkten Socket-Schema plus der normalisierten `Host` Authority ist, bearer-authentifiziert und dann vor der CORS-Wand entfernt, während seine bestehenden öffentlichen statischen Routen unauthentifiziert bleiben. Zwei Ausnahmen erfordern weiterhin `--allow-origin` — weitergeleitete Header begründen niemals Same-Origin-Vertrauen, daher ist der `https` Browser-Origin eines TLS-beendenden Reverse-Proxys nicht same-origin (und auch nicht ein Plain-HTTP-Vermittler, der den `Host` Header umschreibt, wie nginx' Standard `proxy_set_header Host $proxy_host` oder k8s Ingress; das Heilmittel dort ist `--allow-origin <origin>` für den Origin, den Ihr Browser sieht, oder ein Proxy, der `Host` wörtlich weiterleitet — Portübersetzung allein benötigt nichts, da nur der weitergeleitete `Host` verglichen wird, wobei nur die Schema-Standard `:80`/`:443` entfernt werden), und die WebSocket-Upgrad-Routen (Terminal, Voice) behalten ein separates CSWSH-Gate, das nur Same-Port-Loopback-Origin, explizit allowlistierte Origin (einschließlich Loopback-Port-Wildcards) und den eigenen Origin des Local Control Listeners zulässt; das `*` Literal gilt dort nicht.
- **Chrome-Extension-Browser-Automatisierung ist getrennt von Framing.** `qwen serve --allow-origin chrome-extension://<id>` lässt die Extension die Web Shell framem und sich mit dem Daemon verbinden. Console/Network/Screenshot/Click-Tools erfordern einen externen CDP-MCP-Adapter-Befehl: `QWEN_CDP_MCP_COMMAND=/path/to/cdp-mcp-adapter qwen serve --allow-origin chrome-extension://<id>`. Das Haupt-CLI-Paket bündelt keinen Browser-Automatisierungs-Adapter; Clients können `caps.features.includes('browser_automation_mcp')` prüfen, bevor sie diese Tools als verfügbar darstellen.
- **Ein gestartetes `qwen --acp`-Child erhält die effektive Umgebung seiner besitzenden Runtime.** Der Daemon friert eine Prozess-Env-Basis ein, wendet das Settings/Env-File-Overlay des Workspaces auf einen Runtime-lokale Snapshot an und schreibt das Overlay niemals zurück in `process.env`; gleichnamige Keys in einer anderen Runtime übergreifen nicht. `QWEN_SERVER_TOKEN` wird vor dem Spawnen entfernt, da der Agent das Daemon-Bearer nicht benötigt. Loader-beeinflussende Variablen (`NODE_OPTIONS`, `npm_config_node_options` und npm's Config-File-Weiterleitungen, `NODE_PATH`, `OPENSSL_CONF`, `NODE_REPL_EXTERNAL_MODULE`, `npm_config_node_gyp`, `npm_config_init_module`, `LD_PRELOAD`, `LD_AUDIT`, `DYLD_INSERT_LIBRARIES`, `BASH_ENV`, `ZDOTDIR`, exportierte Bash-Funktionsdefinitionen `BASH_FUNC_*`) werden ebenfalls niemals an Session-Subprozesse übergeben — der Daemon entfernt sie aus seiner eigenen `process.env` und aus der Frozen-Base-Env, mit der Session-hostende Children spawnen (die Base-Env behält sie nur unter dem `DEV=true`-Harness, dessen `.ts`-Einträge den tsx-Loader benötigen), und `.env`- / `settings.json`-`env`-Quellen weisen sie zurück (siehe [Settings](./configuration/settings.md)); dies gilt für jede Session, die der Daemon hostet. Basis-Credentials wie `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `QWEN_*` und `DASHSCOPE_API_KEY` werden ansonsten durchgereicht, es sei denn, das Runtime-Overlay ändert sie. **Dies ist beabsichtigt, keine Sandbox.** Der Agent läuft unter derselben UID mit Shell-Tool-Zugriff, sodass unabhängig davon alles in `~/.bashrc` / `~/.aws/credentials` / `~/.npmrc` durch Prompt-Injection erreichbar ist. Umgebungsisolation zwischen Runtimes ist keine Betriebssystem-Sicherheitsgrenze; führe `qwen serve` nicht unter einer Identität aus, die über Credentials verfügt, die du dem Agenten nicht anvertrauen würdest.
- **Agent-Text-Lesungen sind child-lokal und folgen den regulären CLI-Permission-Regeln, nicht der Workspace-Dateisystem-Grenze.** Direktes `read_file` kann Host-Text-Pfade außerhalb jedes registrierten Workspaces erreichen: externe Pfade erfordern standardmäßig eine Bestätigung, und Allow-Regeln oder Genehmigungsmodi können sie automatisch genehmigen. Genehmigte Lesungen verwenden die konfigurierbaren CLI-Output-Limits anstelle der Returned-Output-, Full-Snapshot- und Large-Text-Scan-Caps des Workspace-Dateisystems. Dies gilt für jeden geteilten Text-Lese-Consumer, sodass die Pre-Reads von Write-, Edit-, Notebook-, Sed- und Artifact-Operationen diese Caps zusammen mit dem Lese-Audit des Workspace-Dateisystems, der Symlink-Ablehnung und den Read-seitigen TOCTOU-Schutzmechanismen verlieren — siehe [das Lese-Design](../design/daemon-local-text-reads.md) für die genaue Liste. Da ein Bestätigungs-Payload durch Lesen der Datei erstellt wird, wird ein Out-of-Workspace-Diff an **jeden** angehängten SSE-Subscriber verteilt, bevor jemand ihn genehmigt — im interaktiven CLI wird dieser Inhalt nur von der Person am Terminal gesehen. Behandle authentifizierte Daemon-Clients wie denselben Sicherheitsprinzipal. HTTP-Dateisystem-Routen bleiben Workspace-scoped und das Verhalten von Agent-Discovery-Tools bleibt unverändert.
- **Genehmigte finale Writes von eingebauten Text-Tools haben eine schmale Same-Host-Route.** `write_file`, `edit`, `notebook_edit` und der simulierte Sed-Editor des Shell-Tools hängen interne Provenienz erst an, nachdem die bestehende Permission-Policy die Ausführung erlaubt. Ihr finaler ACP-Text-Write kann daher einen absoluten Pfad außerhalb des besitzenden Workspaces ohne zweite Bestätigung ansteuern; Allow-Regeln, AUTO/AUTO_EDIT und YOLO verhalten sich wie die CLI, während Ablehnung, Plan, Hook/Guard-Verweigerung und Vor-Ausführungs-Abbruch den finalen Write nicht senden. Abbruch nach Eintritt eines Tools in eine nicht-abbrechbare Dateisystem-Operation behält das bestehende Verhalten des Tools bei. Workspace-Ziele verwenden weiterhin WFS. Externe Ziele verwenden einen Daemon-Host-Writer mit demselben Trust-Snapshot, 5 MiB Encoded-Limit, Leaf-Symlink-Ablehnung, Canonical-Path-Lock, Atomic-Rename, Mode-Erhaltung, `0600`-New-File-Mode standardmäßig (konfigurierbar — siehe [New-file mode for agent text writes](#new-file-mode-for-agent-text-writes)), Generation-Guard und Dateisystem-Audit. HTTP-Writes, generische oder nicht markierte ACP-Writes, injizierte Bridge/Workspace-Registry/Factory-Integrationen und beliebige Shell-Redirects erhalten diese Ausnahme nicht. Siehe [das External-Write-Design](../design/daemon-external-tool-text-writes.md).
- **Begrenzte SSE-Warteschlangen pro Abonnent** – ein langsamer Client, der seine Warteschlange überläuft, erhält ein terminales `client_evicted`-Frame und wird getrennt; ein festsitzender Consumer kann den Daemon nicht blockieren.
- **Limit für die Prompt-Zulassung pro Session** – standardmäßig 5 akzeptierte, aber noch nicht abgeschlossene Prompts pro Session. Ein fehlerhafter Client kann keine unbegrenzten Prompt-Promises oder temporäre SSE-Wartezeiten für eine Session in die Warteschlange stellen.
- **Graceful Shutdown** – SIGINT/SIGTERM fahren die Agent-Child-Prozesse herunter, bevor der Listener geschlossen wird (10s-Frist pro Child-Prozess).

> ⚠️ **Berechtigungsabstimmungen sind jetzt sitzungsspezifisch — plus ein stehender Shared-Bearer-Vorbehalt.** Bevorzugen Sie `POST /session/:id/permission/:requestId` (Wave 4 / F3): Es leitet an die Laufzeitumgebung weiter, die die benannte Live-Sitzung besitzt, und fällt niemals auf den primären Bridge zurück — neue Multi-Workspace-Integrationen sollten immer diese Route verwenden (Pre-flight `caps.features.session_permission_vote`). Der Legacy-prozessglobale `POST /permission/:requestId` bleibt für Pre-F3 Single-Workspace-Clients bestehen: Er ist primär gebunden und `404` für eine Sitzung, die von einer anderen registrierten Laufzeitumgebung besessen wird — derselbe Body wie eine verlorene Abstimmung unter der Standard-`first-responder`-Richtlinie — daher bedeutet ein `404` dort nicht allein, dass die Anfrage bereits beantwortet wurde. Routentabelle: [daemon REST API reference](../developers/daemon-rest-api-reference.md#permissions). Stehender Vorbehalt: Jeder Client, der das Bearer-Token hält, ist derselbe Sicherheitsprinzipal — betreiben Sie `qwen serve` nicht hinter einem Bearer, der mit nicht vertrauenswürdigen Parteien geteilt wird.
>
> ⚠️ **Bekannte Lücke in Stage 1 – `POST /session/:id/prompt`-Body auf 10 MB begrenzt (BUy4L).** Multimodale Prompts, die Bilder / PDFs / Audio enthalten und 10 MB überschreiten, schlagen beim Body-Parsing fehl, bevor die Routenlogik ausgeführt wird (kein Streaming, kein Abbruch mitten im Upload). Workaround: Verkleinere den Inhalt clientseitig oder übergebe eine Pfadreferenz und lass den Agenten die Datei über `readTextFile` lesen. Stage 1.5 wird `multipart/form-data` oder Chunked-Encoding auf `/prompt` akzeptieren, damit große Prompts nicht abrupt abbrechen.
>
> ⚠️ **Bekannte Lücke in Stufe 1 — Phantom-SSE-Verbindungen hinter NAT.** Der Daemon erkennt tote Clients über TCP-Backpressure bei Heartbeats (15s Intervall). Ein Client, der ohne TCP RST verschwindet (z.B. eine NAT-Box, die idle Flows stillschweigend verwirft), hält den Kernel-Level-Socket "alive", bis die Keepalive-Probes von Node timeouten — typischerweise ~2 Stunden bei Linux-Standardeinstellungen. In `--hostname 0.0.0.0`-Bereitstellungen hinter solchen NATs können sich Phantom-SSE-Verbindungen ansammeln und schließlich die 256 `server.maxConnections`-Grenze erreichen.
>
> Setzen Sie [`--writer-idle-timeout-ms <n>`](#deadlines-and-writer-idle-timeout) (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9), um die Lücke mit einer expliziten Idle-Deadline auf Anwendungsebene zu schließen: Wenn seit `n` ms kein Write erfolgreich geflusht wurde, sendet der Daemon einen terminalen `client_evicted`-Frame mit `reason: 'writer_idle_timeout'` und schließt den Stream. Das Flag ist standardmäßig deaktiviert, um den Legacy-Vertrag beizubehalten — Operatoren in Netzwerken, die RSTs schlucken, sollten einen Wert deutlich über dem 15s Heartbeat-Intervall wählen (z.B. `60000`–`300000`), damit legitime idle Verbindungen nicht verdrängt werden, während wirklich feststeckende Writer prompt bereinigt werden. Führen Sie eine Vorabprüfung `caps.features.includes('writer_idle_timeout')` von Ihrem SDK aus, um zu bestätigen, dass der Daemon dies unterstützt.

### Fristen und Writer-Inaktivitäts-Timeout [#deadlines-and-writer-idle-timeout]

Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514) T2.9 liefert zwei Opt-in-Flags, die die Lücken bei langlaufenden / Remote-Deployments schließen, die der 15s-Heartbeat + AbortSignal nicht abdecken. Der shared Permission-Response-Timeout ist hier ebenfalls aufgeführt. Alle drei sind standardmäßig deaktiviert.

| Flag | Env var | Default | Was es tut |
| -------------------------------------- | ----------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--prompt-deadline-ms <n>`             | `QWEN_SERVE_PROMPT_DEADLINE_MS`     | nicht gesetzt | Serverseitige Wallclock-Obergrenze für ein einzelnes `POST /session/:id/prompt`. Bei Ablauf bricht der Daemon den AbortController des Prompts ab und gibt HTTP `504` mit `{code:"prompt_deadline_exceeded", errorKind:"prompt_deadline_exceeded", deadlineMs:n}` zurück. Ein `deadlineMs`-Feld im Request-Body pro Prompt kann die effektive Frist unterhalb des Flags verkürzen, aber niemals verlängern. Capability-Tag (bedingt): `prompt_absolute_deadline`.                                                                                                                                                                                                |
| `--writer-idle-timeout-ms <n>`         | `QWEN_SERVE_WRITER_IDLE_TIMEOUT_MS` | nicht gesetzt | Idle-Frist pro SSE-Verbindung. Wenn für `n` ms kein Write ERFOLGREICH geflusht wurde – weder ein echtes Event noch der 15s-Heartbeat – gibt der Daemon ein terminales `client_evicted`-Frame mit `data.reason = 'writer_idle_timeout'` (gespiegelt in `data.errorKind`) aus und schließt den Stream. **Wähle einen Wert komfortabel über dem 15s-Heartbeat** (z. B. `30000`–`300000`), damit legitime Idle-Streams nicht getrennt werden; Werte `< 15000` TRENNEN ansonsten gesunde Idle-Verbindungen, bevor der erste Heartbeat feuert (nur beabsichtigt für Tests / kurzlebige Dev-Sessions). Capability-Tag (bedingt): `writer_idle_timeout`. |
| `--permission-response-timeout-ms <n>` | —                                   | `0`     | Gemeinsame Wallclock für Ordinary-Permission- und `ask_user_question`-Antworten im Daemon-Modus. `0` oder ein weggelassenes Flag wartet unbegrenzt; eine positive Ganzzahl erzwingt eine Frist für beide. Voter-Abbruch, Session-Abbruch und Daemon-Shutdown lösen pending Interaktionen weiterhin auf, wenn der Timer deaktiviert ist.                                                                                                                                                                                                                                                                                                            |

Die Prompt- und Writer-Flags akzeptieren eine positive Ganzzahl in Millisekunden; `0`, `NaN`, nicht-ganzzahlige oder negative Werte werden beim Start mit einer klaren Fehlermeldung abgelehnt. Der Permission-Response-Timeout akzeptiert `0` oder eine positive Ganzzahl. Für die beiden Umgebungsvariablen-gestützten Deadlines haben explizite `ServeOptions`-Felder Vorrang vor Umgebungsvariablen-Werten. SDK-Nutzer sollten den passenden Capability-Tag per Pre-Flight prüfen, bevor sie sich auf das Prompt- und Writer-Verhalten verlassen.

### Neue-Datei-Modus für Agent-Textschreibvorgänge [#new-file-mode-for-agent-text-writes]

Agent-Text-Schreibvorgänge (`write_file`, `edit`, `notebook_edit` und der simulierte Sed-Editor des Shell-Tools) werden über den atomaren Writer des Daemons veröffentlicht, der den Modus einer bestehenden Datei beibehält und — für **neue** Dateien — standardmäßig auf `0600` (nur Owner) setzt, unabhängig von der umask des Daemon-Prozesses. Dieser fail-closed Standard ist beabsichtigt: Eine frisch vom Agenten erstellte Datei ist niemals versehentlich für Gruppe/Other lesbar, egal wie permissiv die Supervisor-umask ist.

Betreiber, deren Deployment-Konvention umask-gesteuert ist (z. B. eine systemd-Unit mit `UMask=0002`, Shared-Group-Repositories), können neue Dateien für die Standard-POSIX-Behandlung aktivieren mit:

| Env-Variable               | Werte             | Standard | Wirkung                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------- | ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_NEW_FILE_MODE` | `owner` \| `system` | `owner` | `system` erstellt NEUE Dateien mit `0o666 & ~umask`, sodass vom Agenten erstellte Dateien der umask des Daemon-Prozesses folgen wie jeder andere Prozess auf der Maschine. `owner` behält den umask-unabhängigen `0600`-Standard. Werte sind case-insensitive; das Literal `0600` wird als Alias für `owner` akzeptiert (keine anderen Oktalmodi werden unterstützt), und jeder andere Wert wird mit einer stderr-Warnung abgelehnt und der `0600`-Standard beibehalten. |

Geltungsbereich und Grenzen:

- Gilt für NEUE Dateien, die von den Text-Write-Routen erstellt werden (Workspace-Ziele, der Same-Host-External-Host-Writer und HTTP-Text-Schreibvorgänge). Bestehende Dateien behalten immer ihren On-Disk-Modus — das Bearbeiten eines `0600`-Secrets lässt es `0600`, eine ausführbare Datei behält `+x`.
- Binär-Uploads (`POST /file/upload`) erstellen immer mit `0600`, unabhängig von dieser Einstellung.
- Der Daemon liest die Variable beim Aufbau des Workspace-Dateisystems; starten Sie den Daemon nach einer Änderung neu.

### Arbeitsverzeichnis für Konversationen [#conversations-working-directory]

Legen Sie das Arbeitsverzeichnis-Stamm für Standalone- und Live-Sitzungen unabhängig vom Betriebssystem-Home fest:

```bash
qwen serve --conversations-dir /persistent/qwen-conversations

# Or configure the launch environment:
QWEN_CONVERSATIONS_DIR=/persistent/qwen-conversations qwen serve

# The same option is available for a detached daemon:
qwen daemon start --conversations-dir /persistent/qwen-conversations
```

Das explizite Flag hat Vorrang vor `QWEN_CONVERSATIONS_DIR`, das aus der Startumgebung oder einer Benutzer-`.env`-Datei stammen kann. Eingebettete Launcher können denselben Stamm mit `ServeOptions.conversationsDir` auswählen, was ebenfalls Vorrang vor der Umgebung hat. Wenn weder konfiguriert ist, bleibt der Stamm `~/Documents/Qwen Code/Conversations`. Das Einhängen eines persistenten Volumes an diesem Standardpfad oder das Ändern des Prozess-Homes sind ebenfalls gültige Bereitstellungsoptionen.

Ein expliziter Wert muss ein nicht leerer, voll qualifizierter absoluter Pfad ohne NUL-Zeichen sein. Relative Pfade, ein nicht expandiertes `~` und Windows-Pfade, die vom aktuellen Laufwerk abhängen, werden abgelehnt. Werte werden nicht getrimmt, und ungültige Konfiguration schlägt beim Start fehl, statt auf einen Fallback zurückzugreifen. Ein gültiges explizites Flag oder eine API-Option überschreibt einen ungültigen Umgebungsvariablenwert. Die Pfadsyntax wird vor dem Lauschen geprüft; die Verzeichniserstellung und Dateisystemprüfungen bleiben verzögert, sodass ein ungenutzter Conversations-Stamm nicht beim Start erstellt wird. Ein Dateisystemfehler bei der ersten Verwendung wählt keinen anderen Stamm aus.

Die Auswahl ist für die Lebensdauer des Daemons festgelegt. Projekt-`.env`- und Projekt-`.qwen/.env`-Dateien, Top-Level-`settings.json` `env` auf jeder Ebene, Umgebungswiederladungen und Browser-/Sitzungsanfragen können ihn nicht umleiten. Es gibt keine entsprechende Projekteinstellung oder pro-Sitzungs-Stammoption.

Standalone und Live teilen weiterhin die bestehende Conversations-Runtime. Jede Sitzung verwendet ihr deterministisches privates `conversation-<sha256(normalized session ID)>`-Direktunterverzeichnis als Arbeitsverzeichnis für Tools und Shell. Bestehende Prüfungen auf Eigentümerschaft, private POSIX-Berechtigungen, kanonische Identität, Direktunterverzeichnisse, Links/Reparse-Punkte, Schreib-Leases und Wiederherstellung gelten weiterhin, einschließlich ihrer plattformspezifischen Einschränkungen. Windows erhält keine Garantien für POSIX-Eigentümer/Modus oder ACLs, und Dateisysteme ohne verifizierbare Inode-Identität können weiterhin nicht jede Ersetzung unter demselben Pfad erkennen. Der ausgewählte Conversations-Baum bleibt vor der normalen Workspace-Registrierung reserviert; andere Workspaces behalten ihre bestehenden Regeln bei.

Das Arbeitsstammverzeichnis und der Runtime-Speicher haben separate Verantwortlichkeiten:

| Daten | Speicherort |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Sitzungsarbeitsdateien | Private Sitzungsunterverzeichnisse unter dem ausgewählten Conversations-Stamm. |
| Konfiguration des gemeinsamen Stammverzeichnisses | Vom Benutzer erstellte Konfiguration unter dem ausgewählten Stamm, geteilt über dessen Sitzungen hinweg. |
| Transkripte und Sidecars | Bestehender Daemon-Runtime-Basis-Speicher, indiziert nach dem kanonischen Conversations-Runtime-cwd. |
| Lösch-Wiederherstellungs-Journale | Der stabile `<home>/.qwen/conversations/deletions`-Namespace. |
| Live-Entdeckung | Der stabile `<home>/.qwen/live/daemon.json`-Locator und, wo zutreffend, seine Kopie im Daemon-Runtime-Basis-Speicher. |
| Lokale Daemon-Entdeckung | `daemon/daemon-<port>.json` unter der Daemon-Runtime-Basis; speichert den ausgewählten Conversations-Pfad für den Neustart. |

`QWEN_HOME` wählt das globale Qwen-Konfigurationsverzeichnis aus. `QWEN_RUNTIME_DIR` und `advanced.runtimeOutputDir` wählen den Runtime-Ausgabespeicher über ihre bestehenden Vorrangregeln aus. Keines davon wählt das Wurzelverzeichnis für das Conversations-Arbeitsverzeichnis aus. Das bloße Persistieren des Runtime-Speichers persistiert keine Dateien, die in privaten Sitzungsverzeichnissen erstellt wurden; das bloße Konfigurieren des Arbeitsstamms bewahrt auch keinen Runtime-Speicher oder wiederherstellungs-/entdeckungsbezogenen Home-Zustand.

Um einen Neustart mit demselben Stamm durchzuführen, behalten Sie denselben kanonischen Pfad, dieselbe Runtime-Basis und den erforderlichen Steuerzustand bei. `qwen daemon restart` behält den Stamm aus einem aktuellen Entdeckungsdatensatz bei, und ein automatischer Update-Neustart behält ebenfalls den ausgewählten Stamm bei. Normale Akzeptanz der Dateisystemidentität, Berechtigungen, Schreib-Leases und Wiederherstellungsprüfungen laufen weiterhin ab; dies ist keine Garantie für eine Wiederherstellung nach jedem Container- oder Host-Neustart. Siehe [Conversations-Schreibsperren und Wiederherstellung](./conversations-recovery.md).

Um Stämme absichtlich zu ändern, schließen Sie die ausstehende Lösch-Wiederherstellung gegen den ursprünglichen Stamm ab, stoppen Sie alle Writer, die ihn verwenden, und starten Sie dann den Daemon mit der neuen Konfiguration neu. Ein anderer kanonischer Stamm wählt einen anderen Speicher-/Entdeckungs-Namespace für den Verlauf und eine andere Konfiguration des gemeinsamen Stamms aus. Es werden keine Arbeitsdateien, Sitzungsdatensätze, Konfigurationen, Wiederherstellungsjournale oder Entdeckungszustände automatisch migriert, und es wird nicht garantiert, dass alter Verlauf sichtbar bleibt. Entfernen Sie keine Wiederherstellungsnachweise, um die Akzeptanz zu erzwingen: Wenn die Wiederherstellung gegen den ursprünglichen Stamm nicht abgeschlossen werden kann, ist das Ändern dieser Option kein Reparaturverfahren.

### Speicher für Sitzungsanhänge [#session-attachment-storage]

Sitzungsanhänge (Dateien und Bilder, die von Web Shell über `POST /session/:id/attachments` hochgeladen werden) werden standardmäßig im Runtime-Temp-Verzeichnis des Workspaces gespeichert: `<runtimeBaseDir>/tmp/<projectHash>/attachments`, indiziert pro Sitzung als `session-<sessionId>`. Operatoren, die möchten, dass Anhänge außerhalb des Runtime-Temp-Verzeichnisses persistieren (z. B. auf einem dedizierten Volume), können den Stamm überschreiben:

| Umgebungsvariable | Werte | Standard | Funktion |
| ------------------------------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `QWEN_SERVE_SESSION_ATTACHMENTS_ROOT` | Pfad | nicht gesetzt | Speichert Sitzungsanhänge unter diesem Verzeichnis anstelle des Standard-Runtime-Temp-Verzeichnisses. Akzeptiert einen absoluten Pfad, einen relativen Pfad zum cwd des Daemons oder `~` / `~/…`, expandiert gegen das Home-Verzeichnis. |

Geltungsbereich und Grenzen:

- **Einweg-Migration.** Wenn die Umgebungsvariable gesetzt ist, werden neue Anhänge nur unter dem konfigurierten Stamm geschrieben. Lese- und Löschvorgänge, die den konfigurierten Stamm verfehlen, fallen auf das Standard-Runtime-Temp-Verzeichnis zurück, sodass Anhänge, die **vor** der Umschaltung hochgeladen wurden, lesbar bleiben und gelöscht werden können, solange das Standard-Fallback-Verzeichnis beschreibbar ist – ein Löschvorgang, dessen Legacy-Kopie nicht entfernt werden kann (z. B. auf einem schreibgeschützten Fallback-Volume), meldet den Fehler, statt Erfolg zu berichten. Die umgekehrte Richtung – das Entfernen der Umgebungsvariable, nachdem Anhänge in den konfigurierten Stamm geschrieben wurden – macht diese Anhänge unerreichbar; halten Sie die Variable für einen gegebenen Workspace stabil.
- **Layout pro Sitzung.** Dateien befinden sich unter `<root>/<projectHash>/attachments/session-<sessionId>/` an beiden Orten, wobei `<projectHash>` derselbe Workspace-Hash ist, der vom Standard-Runtime-Temp-Verzeichnis verwendet wird; die Fallback-Suche verwendet dasselbe Sitzungslayout im Standardverzeichnis. Zwei Workspaces, die auf denselben konfigurierten Stamm zeigen, bleiben voneinander isoliert.
- **Löschbereinigung.** Wenn eine Sitzung gelöscht wird, wird ihr Anhangsverzeichnis sowohl aus dem konfigurierten Stamm als auch aus dem Standard-Fallback-Verzeichnis entfernt. Das Archivieren einer Sitzung behält ihre Anhänge bei, damit sie das Entarchivieren überleben.
- Der Daemon liest die Variable beim Start; starten Sie den Daemon nach einer Änderung neu. Das Verzeichnis muss für den Daemon-Prozess beschreibbar sein.

## Bereitstellung mit mehreren Sitzungen & mehreren Workspaces [#multi-session--multi-workspace-deployment]

Übergib `--workspace` mehr als einmal, um mehrere nicht überlappende Workspaces in einem `qwen serve`-Prozess zu registrieren. Der erste Pfad ist primär. Jeder registrierte Workspace besitzt eine isolierte Runtime-Grenze, während der Daemon-weite Listener, die Authentifizierungs-Policy und das Gesamt-Session-Limit geteilt werden. Production versucht, das primäre ACP-Child für Kompatibilität vorzuwärmen und wiederholt den ersten Versuch nach einem Fehlschlag; vertrauenswürdige Secondaries starten ihr eigenes Child bei Bedarf, und nicht vertrauenswürdige Secondaries starten keinen ACP. Anfragen können einen registrierten Workspace nach kanonischem `cwd` auswählen; Anfragen, die `cwd` weglassen, verwenden den primären Workspace. Verwende einen Daemon pro Benutzer oder Sicherheitsprinzipal; Workspace-Trust ist ein Ausführungs-Gate, keine ACL.

Ein nicht vertrauenswürdiger Secondary-Workspace ist in der Web Shell als `untrusted` und `read-only` sichtbar. Er kann erweitert werden, um den persistierten Session-Katalog zu inspizieren, aber er kann noch nicht in der Web Shell ausgewählt oder geöffnet, fortgesetzt, zur Erstellung von Sessions verwendet oder vollständig exportiert werden. Die REST-API folgt der bestehenden begrenzten Dateisystem-Lese-Policy und legt auch ihren persistierten Session-Gruppen-Katalog und, wenn `workspace_persisted_transcript` beworben wird, ihr aktives persistiertes Transkript über den begrenzten Workspace-qualifizierten Pager offen. Diese Lesungen enthalten keinen Live-Runtime-State und starten kein ACP-Child. Der vollständige Workspace-qualifizierte Export erfordert einen vertrauenswürdigen Workspace und die separate `workspace_session_export`-Capability. Vertraue dem Workspace und starte den Daemon neu, bevor du Ausführungs-, Mutations- oder Export-Features verwendest. Ein nicht vertrauenswürdiger primärer Workspace bleibt in der Web Shell deaktiviert.

Verwende separate Daemon-Prozesse, wenn du eine kleinere Fehler- oder Sicherheitsgrenze, unabhängige Bearer-Tokens, Quotas, Audit-Grenzen, Betriebssystem-Isolation oder unabhängige Ressourcen-Überwachung benötigst. Der Multi-Workspace-Modus ist dafür gedacht, dass ein Operator mehrere Repos hostet; er ist keine Multi-Tenant-Isolationsgrenze. Ein einzelner Daemon-Token autorisiert jede Route, die der Daemon exposed, einschließlich des erlaubten Lese-Katalogs für alle registrierten Workspaces.

> **Abonniere BEVOR du `modelServiceId` beim Attach postest.** Wenn ein Client `POST /session` mit einer `modelServiceId` aufruft und der Workspace bereits eine Session hat, die ein anderes Modell ausführt, gibt der Daemon einen internen `setSessionModel`-Aufruf aus – Fehler werden NICHT als HTTP-Fehler propagiert (die Session bleibt auf ihrem aktuellen Modell betriebsbereit). Das sichtbare Fehlersignal ist ein `model_switch_failed`-Event im SSE-Stream der Session. Wenn du `POST /session` aufrufst und erst DANN `GET /session/:id/events` öffnest, verpasst du das Fehler-Event und sprichst stillschweigend weiter mit dem falschen Modell. Öffne zuerst den SSE-Stream oder übergebe `Last-Event-ID: 0` beim Abonnieren, um das älteste verfügbare Event des Rings erneut abzuspielen.

Um mehrere **Benutzer oder Sicherheitsprinzipale** zu verwalten (jeder mit einem unabhängigen Token, Quota, Audit-Log, Sandbox oder Prozess-Fehlgrenze) oder um über die Reichweite eines einzelnen Prozesses hinaus zu skalieren (Cold-Start-Budget, FD-Anzahl, RSS), starte einen Daemon pro Prinzipal hinter einem externen Orchestrator. Jeder solcher Daemon kann weiterhin mehrere Workspaces für diesen Prinzipal hosten. Der Orchestrator (Multi-Tenancy / OIDC / Quota / Audit / k8s) liegt **außerhalb des Scopes** des qwen-code-Projekts – siehe Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) "External Reference Architecture" für die Design-Hinweise.

## Laden und Fortsetzen einer persistierten Session [#loading-and-resuming-a-persisted-session]

Der Daemon legt ACPs `session/load`- und Resume-Flow über HTTP offen, plus einen separaten Lese-Transkript-Pager:

| Route                                                   | Use when                                                                                                                                                                                                                                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /session/:id/load`                                | Der Client hat **keine** nützliche lokale Historie gerendert (Cold-Reconnect, Picker-then-Open). Für eine Live-Sitzung gibt der Daemon das aktuelle begrenzte Replay-Snapshot-Fenster zurück und injiziert es; wenn älteres Replay verworfen wurde, beginnt der Snapshot mit `history_truncated`. Capability-Tag: `session_load`. |
| `POST /session/:id/resume`                              | Der Client hat die Turns bereits auf dem Bildschirm und benötigt nur das daemon-seitige Handle zurück. Der Modellkontext wird auf Agent-Seite ohne UI-Replay wiederhergestellt – der SSE-Stream bleibt sauber. Capability-Tag: `session_resume` (`unstable_session_resume` bleibt ein deprecated Alias für ältere Clients).     |
| `GET /session/:id/transcript`                           | Der Client benötigt das vollständige aktive persistierte Transkript. Es gibt id-loser Replay-Frames in Cursor-Seiten zurück und ruft nicht `/load` auf, hängt keinen Client an, seedet den Live-EventBus, erstellt keine Live-Sitzung oder verändert das Live-Replay-Fenster. Capability-Tag: `session_transcript`.                    |
| `GET /workspaces/:workspace/session/:id/transcript`     | Der Client benötigt ein aktives persistiertes Transkript aus einem ausgewählten Workspace. Forward- und Cursor-Seiten bleiben daemon-lokal; eine rückwärts gerichtete erste Seite für eine Live-Sitzung kann ACP starten und Workspace-Settings laden, um den persistierten Schwanz zu flushen. Registrierte nicht vertrauenswürdige Secondary-Workspaces können diesen lesegeschützten Pfad verwenden. Capability-Tag: `workspace_persisted_transcript`.                                            |
| `GET /workspaces/:workspace/session/:id/export`         | Der Client benötigt einen vollständigen `html`-, `md`-, `json`- oder `jsonl`-Anhang aus einem ausgewählten vertrauenswürdigen Workspace. Er liest aktiven persistierten Speicher, ohne ACP zu starten oder auf primär zurückzufallen. Capability-Tag: `workspace_session_export`.                                                         |
| `GET /workspaces/:workspace/session/:id/archive/export` | Der Client benötigt dieselben Anhangsformate aus archiviertem persistiertem Speicher in einem ausgewählten vertrauenswürdigen Workspace. Er archiviert nicht um, startet ACP nicht oder fällt auf eine aktive oder primäre Sitzung zurück. Capability-Tag: `workspace_archived_session_export`.                                                |

Für Last und Fortsetzung stellt das TypeScript SDK statische Fabriken auf `DaemonSessionClient` bereit:

```ts
import { DaemonClient, DaemonSessionClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl: 'http://127.0.0.1:4170' });

// Cold reconnect — daemon will replay the bounded snapshot window through SSE.
const session = await DaemonSessionClient.load(client, 'persisted-id');

// Or, if your UI already has the history, skip the replay:
// const session = await DaemonSessionClient.resume(client, 'persisted-id');

for await (const event of session.events()) {
  // First the replayed `session_update` frames (load only),
  // then live events.
}
```

Führe `caps.features.session_load`, `caps.features.session_resume` oder `caps.features.session_transcript` vor dem Aufruf der passenden Route per Pre-Flight aus – ältere Daemons geben `404` zurück. `unstable_session_resume` wird weiterhin als deprecated Kompatibilitäts-Alias beworben. Gleichzeitige Same-Action-Requests für dieselbe ID werden zusammengeführt; Cross-Action-Races (ein `load`, der mit einem `resume` wetteifert) und Caller-supplied-id-Spawns, die mit einem Restore wetteifern, erhalten `409 restore_in_progress` mit `Retry-After: 5`. Ein Restore, der `limits.sessionRestoreTimeoutMs` überschreitet, erhält retryable `504 session_restore_timeout` mit einem Budget-abgeleiteten `Retry-After` (auf 5-120s begrenzt); der noch laufende Child-Request bleibt eingezäunt, bis die Bereinigung abgeschlossen ist, und gleichzeitige Retries mit derselben ID erhalten in diesem Fenster `409 restore_in_progress` mit `reason: awaiting_abandoned_cleanup` und einem Budget-abgeleiteten `Retry-After`, das auf 5-120 Sekunden begrenzt ist, anstatt einer festen 5-Sekunden-Verzögerung. Wenn die Bereinigung unklar ist oder der aufgegebene Restore nach seiner Frist noch immer kein vollständiges Restore-Budget beglichen hat, erhält frische Session-Arbeit vorübergehend `503 acp_channel_unavailable` mit `reason: restore_cleanup_failed` oder `restore_settlement_overdue`. Eine Session-Initialisierung, die ein Timeout überschreitet, aber nicht promptly beglichen wird, kann ähnlich `reason: new_session_cleanup_failed` zurückgeben, wenn eine späte Bereinigung unklar ist, oder `new_session_settlement_overdue`, wenn der Child-Request für ein weiteres Initialisierungs-Budget ausstehend bleibt. Bereits aktive Sessions bleiben aus allen vier Gründen nutzbar. Siehe die [Protokollreferenz](../developers/qwen-serve-protocol.md) für das vollständige Fehler-Envelope.

Für das vollständige persistierte Replay, seite mit `DaemonClient.getSessionTranscriptPage(sessionId, { cursor, limit })` oder der rohen REST-Route:

```bash
curl "http://127.0.0.1:4170/session/$SESSION_ID/transcript?limit=100"
```

Für einen registrierten Workspace verwende `client.workspaceById(workspaceId).getSessionTranscriptPage(sessionId, { cursor, limit })` oder `/workspaces/:workspace/session/:id/transcript`. Die Workspace-qualifizierte Methode verwendet immer natives REST, selbst wenn der SDK-Client einen ersetzbaren ACP-Transport hat. Seine Cursor sind nur für die Daemon-Lebensdauer gültig und müssen nach einem Daemon-Neustart von Seite eins neu gestartet werden. Eine rückwärts gerichtete erste Seite für eine Live-Sitzung kann ACP starten und Workspace-Settings laden, um den persistierten Schwanz vor dem Lesen zu flushen.

Für einen vollständigen Anhang aus einem vertrauenswürdigen registrierten Workspace, führe `workspace_session_export` per Pre-Flight aus und rufe `client.workspaceById(workspaceId).exportSession(sessionId, { format: 'html' })` oder die rohe Route `/workspaces/:workspace/session/:id/export` auf. Leite die Unterstützung nicht von `session_export` oder `workspace_qualified_rest_core` ab: ältere Daemons können beide bewerben und dennoch nur den primären Export beibehalten. Die aktuelle Web-Shell-Export-Aktion bleibt primär-only; verwende das SDK oder die REST-Route für einen anderen Workspace.

Für einen archivierten Anhang, führe `workspace_archived_session_export` per Pre-Flight aus und rufe `client.workspaceById(workspaceId).exportArchivedSession(sessionId, { format: 'html' })` oder `/workspaces/:workspace/session/:id/archive/export` auf. Dieser Pfad liest archivierten Speicher direkt und gibt `409 session_not_archived` für eine nur-aktive ID zurück; er archiviert die Sitzung nicht um. Die Web Shell legt denselben Export für archivierte Zeilen in vertrauenswürdigen primären und sekundären Workspaces offen, wenn die Capability vorhanden ist.

`limit` ist die Zielanzahl aktiver Chat-Datensätze, nicht emittierte Replay-Frames; ein Datensatz kann mehrere `session_update`-Events erzeugen. Eine rückwärts gerichtete Seite kann auf höchstens `3 * limit` Datensätze expandieren, um Turn- und Tool-Call/Result-Grenzen zu wahren. Die erste Antwort friert die JSONL-Snapshot-Größe ein und gibt `nextCursor` zurück, während `hasMore` wahr ist. Spätere Seiten ignorieren Anhänge nach Seite 1, geben aber `409` zurück, wenn die Datei gelöscht, gekürzt, ersetzt, archiviert wurde oder anderweitig mit dem eingefrorenen Cursor in Konflikt steht. Sehr große Snapshots geben `413 transcript_too_large` vor der Indizierung zurück, damit der Daemon keine unbegrenzten Transkriptdateien auf dem Request-Pfad scannt.

Für wiederholtes Paging über die Legacy-Singular-Route setzen Sie `--channel-idle-timeout-ms` auf einen positiven Wert. Mit dem Standardwert `0` wird das ACP-Kind eines inaktiven Workspaces – und der darin enthaltene In-Process-Transkript-Index-Cache – nach jeder Seite abgeräumt, sodass jede Seite das Kind neu startet und den Index durch erneutes Scannen des gesamten eingefrorenen Präfixes neu aufbaut (`O(snapshotSize)` pro Seite). Ein positiver Timeout hält das Kind während des Cursor-Durchlaufs am Leben, sodass es seinen zwischengespeicherten Transkript-Index und die Replay-Konfiguration wiederverwendet, es sei denn, `--child-heap-mode admit` oder `enforce` räumt es ab, um eine kapazitätsbeschränkte Erstellung in einem anderen Workspace zu erfüllen. In diesem Fall startet die nächste Seite das Kind neu und baut den Index neu auf. Vorwärts- und Cursor-Seiten mit Workspace-Qualifikation bleiben daemon-lokal; nur eine rückwärtige erste Seite für eine Live-Sitzung überschreitet die Flush-Barriere.

Hinweis: Das erneute Abspielen der Live-Sitzungs-Historie wird doppelt begrenzt: durch den SSE-Ring für `Last-Event-ID`-Reconnects und durch `--compacted-replay-max-bytes` für den Snapshot, der von `POST /session/:id/load` zurückgegeben wird. Lange Historien mit gesprächigen Turns können eine der beiden Grenzen überschreiten. Der Daemon zeigt Snapshot-Kürzung mit `history_truncated` an; verwende `/transcript`, wenn du die vollständige aktive persistierte Historie benötigst.

## Durability-Modell [#durability-model]

**Live-Sitzungen werden durch Daemon-Neustarts unterbrochen, aber persistierte Sitzungen bleiben auf der Festplatte erhalten und können neu geladen werden:**

- Ein Child-Prozess-Crash veröffentlicht `session_died` und entfernt die Live-Session aus den Maps des Daemons. Die persistierte Session auf der Festplatte **kann** über `POST /session/:id/load` neu geladen werden, wenn ein frischer Agent-Child-Prozess gestartet werden kann.
- Ein Daemon-Neustart verliert jede In-Flight-Live-Session. Die persistierten Sessions bleiben auf der Festplatte und können gegen einen neuen Daemon-Prozess geladen werden, vorbehaltlich derselben Workspace-Binding-Regeln.
- Lange Client-Disconnects (>5 Min. bei einem gesprächigen Turn) können den SSE-Replay-Ring überholen (standardmäßig 8000 Frames) – `Last-Event-ID`-Reconnect löst `state_resync_required` aus. Für Mobile- / instabile Netzwerk-Clients, plane das erneute Öffnen von SSE bei langen Ausfällen oder rufe `POST /session/:id/load` auf, um den aktuellen begrenzten Replay-Snapshot wiederherzustellen; gehe nicht davon aus, dass die Route das vollständige Transkript zurückgibt.
- Dateioperationen (`writeTextFile`) sind über Crashes hinweg atomar (Write-then-Rename); sie sind über Daemon-Neustarts hinweg nicht im Sinne eines Replays atomar – der Datei-Write ist entweder angekommen oder nicht.

Wenn deine Integration serverseitige Cross-Restart-Durability benötigt, die über das hinausgeht, was `session/load` abdeckt (z. B. serververwaltete Retry-Queues), benötigst du weiterhin eine State-Recovery auf Anwendungsebene. Halte keinen langlaufenden, Neustart-sensitiven Zustand innerhalb der Session des Daemons.

## Stage 1.5+ Runtime-Garantien

Der Vertrag von Stage 1 ist auf Prototyping ausgelegt. Gemäß [#3889 chiga0 downstream-consumer review](https://github.com/QwenLM/qwen-code/pull/3889#issuecomment-4427875644) sind die folgenden Punkte **nicht** in Stage 1 enthalten – produktionsreife Integrationen benötigen Stage 1.5+, bevor sie sich darauf verlassen:

**Blocker für ernsthafte nachgelagerte Nutzung:**

1. **`loadSession` / `unstable_resumeSession` über HTTP** — ohne dies kann keine Integration einen Child-Crash oder Daemon-Neustart überstehen, und auch ein Orchestrator, der den Daemon koordiniert, kann den Zustand nicht wiederherstellen.
2. **Persistente Client-Identität (Pair-Tokens + client-spezifische Sperrung)** — Stufe 1 verwendet einen gemeinsamen Bearer; ein geleakter Token sperrt alle, und `originatorClientId` wird vom Client selbst deklariert, anstatt vom Daemon basierend auf der authentifizierten Identität gestempelt zu werden.

**Zuverlässigkeits-Baseline:**

3. ~~**Vom Client initiierter Heartbeat-Pfad**~~ — ausgeliefert über [#4175](https://github.com/QwenLM/qwen-code/issues/4175) PR 9. `POST /session/:id/heartbeat` zeichnet zuletzt gesehene Zeitstempel auf dem Daemon auf (Capability-Tag `client_heartbeat`); SDK-Helper sind `DaemonClient.heartbeat()` / `DaemonSessionClient.heartbeat()`.
4. **`permission_already_resolved`-Event**, wenn ein Vote das First-Responder-Rennen verliert — derzeit müssen UIs den Zustand aus einem `404` ableiten.
5. ~~**Größerer Replay-Ring**~~ — auf 8000 erhöht. **Pro Sitzung konfigurierbarer Ring** noch offen — Mobile- / Chatty-Turn-Workloads benötigen möglicherweise session-spezifische Overrides.
6. **`slow_client_warning`-Event vor `client_evicted`** — sanfter Backpressure, damit sich gutmütige, langsame Clients selbst drosseln können (Render-Tiefe reduzieren, Chunks verwerfen), bevor sie beendet werden.

**Ergonomie der Integration:**

7. **`POST /session/:id/_meta` für IM-artigen Kontext** — Pro-Sitzung Key-Value, das nachfolgenden Prompts angehängt wird (Chat-ID, Absender, Thread-ID), ersetzt die Improvisation pro Kanal.
8. **Tatsächliche Feature-Verhandlung über `/capabilities`** — `protocol_versions: { acp: '0.14.x', daemon_envelope: 1 }`, damit Clients Drift erkennen können, anstatt auf "unknown frame, ignore" zurückzufallen.
9. **Erstklassige Durability-Dokumentation** (dieser Abschnitt) — bereits weiter oben ausgeliefert.

Die vollständige Convergence-Roadmap wird in [#3803](https://github.com/QwenLM/qwen-code/issues/3803) verfolgt.

## Grenzen des Stage-1-Scopes — was wir in Stage 1.5 nicht beheben werden [#stage-1-scope-boundaries--what-we-wont-fix-in-stage-15]

Zwei strukturelle Entscheidungen sind explizite Non-Goals für die Stage 1 / 1.5 / 2 Mainline-Roadmap. Wenn dein Use-Case von einem davon abhängt, plane drumherum, anstatt auf uns zu warten.

### Session-State ist nur lokale Mutation (gemäß [LaZzyMan Review #4270256721](https://github.com/QwenLM/qwen-code/pull/3889#pullrequestreview-4270256721))

Der Stage-1.5-Plan beschreibt die TUI als In-Process-EventBus-Subscriber. In der Praxis **ist die TUI-UI strikt größer als das Wire-Protokoll**:

- **Nur lokale UI** — die ~15 Ink-Dialogkomponenten (`ModelDialog`, `MemoryDialog`, `PermissionsDialog`, `SessionPicker`, `WelcomeBackDialog`, `FolderTrustDialog`, …) und die `local-jsx`-Slash-Commands (`/ide`, `/auth`, `/init`, `/resume`, `/rename`, `/delete`, `/language`, `/arena`, …) rendern terminalspezifisches Ink-JSX. Remote-Clients über HTTP/SSE können Ink nicht äquivalent rendern, und diese Flows emittieren kein Wire-Event.
- **Session-State-Mutationen ohne Wire-Events** — `/approval-mode`, `/memory add`, `/mcp add-server`, `/agents`, `/tools enable/disable`, `/auth`, `/init` (Schreiben von `CLAUDE.md`) ändern alle das Agent-Verhalten, aber nur `/model` publiziert derzeit ein Event (`model_switched`).

**Stage-1-Entscheidung — Option (A) aus dem Review**: Diese Mutationen nicht zu Wire-Events befördern. Die beiden Deployment-Modi haben unterschiedliche Konsequenzen.

#### Modus 1 — Headless `qwen serve` (dieser PR)

Keine TUI-Shell läuft innerhalb des Daemons. Die oben aufgeführten Slash-Commands **existieren nicht** in diesem Modus — es gibt keine Terminal-UI, von der aus sie aufgerufen werden könnten. Der Session-State ist daher:

- **Beim Booten eingefroren** für `approval-mode` / `memory` / `agents` / `tools`-Allowlist / `auth` — alles wird aus den Settings + Festplatte geladen, wenn der `qwen --acp`-Child des Daemons startet; unveränderlich für die Lebensdauer der Session. Über Settings definierte MCP-Server sind ebenfalls beim Booten eingefroren, aber **zur Laufzeit hinzugefügte Server** (über `POST /workspace/mcp/servers`) können ohne Neustart hinzugefügt oder entfernt werden.
- **Über HTTP änderbar** via `POST /session/:id/model` (veröffentlicht `model_switched`), `POST /workspace/mcp/servers` / `DELETE /workspace/mcp/servers/:name` (veröffentlicht `mcp_server_added` / `mcp_server_removed`) und Berechtigungsabstimmungen (`POST /session/:id/permission/:requestId`; der Legacy-prozessglobale `POST /permission/:requestId` bleibt für Pre-F3-Single-Workspace-Clients bestehen).

**Konsequenz:** Remote-Clients im Headless-Modus sehen den **vollständigen Session-State**. Keine TUI verbirgt zusätzlichen Zustand; Drift ist nicht möglich. Wenn du `approval-mode` ändern möchtest, starte den Daemon mit neuen Settings neu. MCP-Server können jetzt zur Laufzeit über die Mutations-Routen hinzugefügt/entfernt werden (`POST /workspace/mcp/servers`, `DELETE /workspace/mcp/servers/:name`) — siehe [Runtime MCP server management](#runtime-mcp-server-management-issue-4514).

#### Modus 2 — Stage 1.5 `qwen --serve` co-gehostete TUI (nicht in diesem PR)

Wenn Stage 1.5 `qwen --serve` ausliefert (der TUI-Prozess hostet denselben HTTP-Server mit), **existiert** die TUI neben den Remote-Clients. Ein lokaler Operator, der `/approval-mode yolo` oder `/mcp add-server` eingibt, mutiert den Session-State, und Remote-Clients über HTTP haben kein Event, um die Änderung zu beobachten.

In diesem Modus ist die TUI ein **"Super-Client"** — sie beobachtet dieselbe Agent-Konversation wie die Remote-Clients UND kann den Session-State mutieren, was Remote-Clients nicht können. Die Asymmetrie ist:

- ✅ Sowohl TUI als auch Remote-Clients sehen dieselben Agent-Nachrichten, Tool-Calls, File-Diffs und Permission-Prompts.
- ❌ Nur die TUI sieht / mutiert Approval-Mode / Memory / MCP-Server-Liste / Agents / Tools-Allowlist / Auth-State.

**Konsequenz in Modus 2:** Wenn eine Remote-Client-UI versucht, die Session-Settings zu spiegeln, kann sie nach jedem TUI-Slash-Command driften. Remote-Clients sollten **bei Attach / Reconnect den Zustand neu abrufen** (verwende `Last-Event-ID: 0`, um das älteste Event des Rings für Dinge wie `model_switched` abzuspielen); sie sollten sich NICHT auf inkrementelle Events für TUI-seitige Mutationen verlassen.

#### Warum (A) und nicht (B) (Mutationen in die `session_state_changed`-Event-Familie befördern)

(B) ist die ambitioniertere Antwort, bindet Stage 1.5 aber an eine wesentlich größere Wire-Surface, die auch sauber durch das geplante In-Process-Refactoring laufen muss. Wir gehen lieber ehrlich den kleineren Scope. Die Arbeit an der Session-State-Event-Taxonomie — die Aufzählung, welche TUI-Flows by Design nur lokal sind gegenüber denen, die plausibel unter einer zukünftigen Opt-in-(B)-artigen Erweiterung zum Wire befördert werden könnten — wandert nach [#3803](https://github.com/QwenLM/qwen-code/issues/3803), nicht in den Stage-1.5-Code.

### N parallele Sessions teilen sich ein `qwen --acp`-Child pro Workspace-Runtime

Mehrere Sessions auf demselben vertrauenswürdigen Workspace **teilen sich den `qwen --acp`-Child-Prozess dieser Runtime** über die native Multi-Session-Unterstützung des Agents (`packages/cli/src/acp-integration/acpAgent.ts:194: private sessions: Map<string, Session>`). Die Bridge ruft `connection.newSession({cwd, mcpServers})` für jede Session auf — der Agent speichert sie in seiner Sessions-Map und demultiplext die sessionId pro Aufruf. Production kann bis zu ein primäres Child besitzen (Vorwärmung standardmäßig versucht) plus ein On-Demand-Child pro vertrauenswürdigem Secondary; nicht vertrauenswürdige Secondaries besitzen keines.

Konkreter Aufwand bei N=5 Sessions auf demselben Workspace:

| Ressource                            | Pro Session                                           | Bei N=5                                                           |
| ------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------- |
| Daemon-Node-Prozess                  | einer                                                 | **30–50 MB** (ein Daemon)                                         |
| `qwen --acp`-Child                   | geteilt                                               | **60–100 MB** (ein Child)                                         |
| MCP-Server-Children                  | Workspace-Pool wenn beworben; sonst pro Session       | geteilt nach passenden Pool-Einträgen, oder bis zu 3×N im Legacy-Fallback |
| `FileReadCache` (im-Child-Heap)      | geteilt                                               | einmal geparst                                                    |
| `CLAUDE.md` / Hierarchie-Memory-Parse| geteilt                                               | einmal geparst                                                    |
| OAuth-Refresh-Token-State            | geteilt                                               | **ein Refresh-Pfad**                                              |
| Auto-Memory gelernte Fakten          | geteilt                                               | eine Knowledge-Base pro Child                                     |
| Cold Start                           | nur der erste                                         | <200 ms nach der ersten Session                                   |

Jede aktive Workspace-Runtime hält **eine Bridge-Grenze**. Production versucht, den primären Kanal vorzuwärmen und wiederholt den ersten Versuch nach einem Fehlschlag; ein vertrauenswürdiger Secondary öffnet seinen Kanal und Child bei Bedarf, während ein nicht vertrauenswürdiger Secondary dies niemals tut. Ein Kanal bleibt am Leben, solange mindestens eine Session aktiv ist. Nach dem letzten `killSession` beendet die Runtime ihr Child standardmäßig sofort oder nach der konfigurierten Kanal-Idle-Gnade; ein Crash auf Kanal-Ebene reißt es ebenfalls ab, ohne eine andere Runtime auszuwählen.

**MCP-Server-Kinder** nutzen den workspace-scope Transport-Pool, wenn `mcp_workspace_pool` advertised wird: passende `(workspace runtime, server name, config fingerprint)`-Einträge werden über Sessions hinweg referenzzählig verwaltet. Wenn die Fähigkeit fehlt, spawnen die Legacy-Pro-Session-Manager sie unabhängig.

**Peer-Agents (Cursor / Continue / Claude Code / OpenCode / Gemini CLI) sind alle Single-Process-Multi-Session.** qwen-code entspricht ihnen auf der Agent-Ebene; die Stage-1-Bridge in diesem PR macht dieselbe Architektur über HTTP sichtbar.

## Login zu einem Remote-Daemon (Issue #4175 PR 21)

Wenn der Daemon auf einem Remote-Pod läuft (kein gemeinsames Display mit Ihnen), kann ein Client einen OAuth-Gerätefluss über HTTP auslösen. Der Daemon pollt den IdP selbst; Ihre Aufgabe ist es lediglich, eine URL auf einem beliebigen Gerät mit Browser zu öffnen.

> [!note]
>
> Das Qwen OAuth Free Tier wurde am 2026-04-15 eingestellt. Die `qwen-oauth` Beispiele unten dokumentieren die Form des Gerätefluss-Protokolls und den Legacy-Anbieter-Identifier; neue Setups sollten einen aktuell unterstützten Auth-Anbieter verwenden.

```bash
# 1. Start a flow. The daemon contacts the IdP, returns a code + URL.
curl -X POST http://127.0.0.1:4170/workspace/auth/device-flow \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"providerId":"qwen-oauth"}'
# → 201 {
#     "deviceFlowId": "fa07c61b-…",
#     "userCode": "USER-1",
#     "verificationUri": "https://chat.qwen.ai/api/v1/oauth2/device",
#     "verificationUriComplete": "https://chat.qwen.ai/...?user_code=USER-1",
#     "expiresAt": 1700000600000,
#     "intervalMs": 5000,
#     "attached": false
#   }

# 2. Visit the URL on your phone / laptop, enter the user code.
# 3. Poll for completion (or subscribe to SSE for the auth_device_flow_authorized event):
curl http://127.0.0.1:4170/workspace/auth/device-flow/fa07c61b-… \
  -H "Authorization: Bearer $TOKEN"
# → status transitions: pending → authorized
```

Das TypeScript SDK kapselt beide Schritte in einem einzigen Helper:

```ts
import { DaemonClient } from '@qwen-code/sdk';

const client = new DaemonClient({ baseUrl, token });
const flow = await client.auth.start({ providerId: 'qwen-oauth' });
console.log(`Open ${flow.verificationUri}\nCode: ${flow.userCode}`);
const result = await flow.awaitCompletion({ signal: abortCtrl.signal });
// result.status === 'authorized'
```

**Der Daemon öffnet niemals einen Browser in deinem Namen.** Auch bei lokaler Ausführung bleibt der Daemon passiv — er gibt die URL zurück und überlässt es dem SDK / Benutzer, zu entscheiden, wo sie geöffnet wird. Das ist Absicht: Ein Daemon auf einem Headless-Pod, der `xdg-open` aufrufen würde, würde stillschweigend fehlschlagen und die eigentliche Auth-Surface verschleiern. Spiegle die UX von `gh auth login` ("Press Enter to open browser") in deinem Client nach.

**`--require-auth` und Entwickler-Komfort.** Device-Flow-Routen verwenden das strikte Mutations-Gate. Der Token-lose vertrauenswürdige Loopback-Default kann einen Flow direkt starten und verwalten; ein nicht vertrauenswürdiges Embed ohne Credentials gibt `401 token_required` zurück. Setze einen verwalteten `QWEN_SERVER_TOKEN` und übergebe `--require-auth` auf gemeinsamen Hosts, CI-Runnern, Remote-Entwicklungsmaschinen oder überall, wo lokale Prozesse sich nicht gegenseitig vertrauen.

**Daemon-übergreifende Einschränkung.** `oauth_creds.json` wird Daemon-übergreifend geteilt (`~/.qwen/oauth_creds.json`), sodass ein erfolgreicher Login in Daemon A automatisch beim nächsten Token-Refresh von Daemon B übernommen wird — aber die SDK-Clients von Daemon B erhalten nicht das `auth_device_flow_authorized`-Event (Events sind pro Daemon).

**Cross-Client Take-over.** Zwei SDK-Clients auf demselben Daemon, die beide `POST /workspace/auth/device-flow` für denselben Anbieter aufrufen, erhalten das Pro-Anbieter-Singleton: Der erste Aufruf startet eine neue IdP-Anfrage und gibt `attached: false` zurück; der zweite Aufruf gibt den BESTEHENDEN in-flight Eintrag mit `attached: true` zurück. Der Take-over wird im Audit Trail aufgezeichnet (unter dem `X-Qwen-Client-Id` des zweiten Clients), aber es wird KEIN separates Event emittiert — beide Clients beobachten schließlich DENSELBEN `auth_device_flow_authorized`, sobald der Nutzer die IdP-Seite abgeschlossen hat. Wenn Ihre UI zwischen "Ich habe dies gestartet" und "Flow eines anderen, dem ich beigetreten bin" unterscheidet, verzweigen Sie basierend auf dem `attached`-Feld, das von `start()` zurückgegeben wird.

## Daemon-Logdatei

`qwen serve` fügt diagnostische Datensätze über normale Neustarts hinweg am stabilen aktiven Pfad hinzu:

```
${QWEN_RUNTIME_DIR or ~/.qwen}/debug/daemon/daemon.log
```

Jeder Datensatz enthält eine zufällige, pro Start `runId` und die Daemon-PID. Ein erfolgreicher stabiler Besitzer aktualisiert auch `debug/daemon/latest` auf `daemon.log` auf Plattformen, die Symlinks unterstützen. Befolgen Sie unter macOS/Linux die Rotation mit:

```bash
tail -F ~/.qwen/debug/daemon/daemon.log
```

Konfigurieren Sie auf anderen Plattformen den Viewer so, dass er den Pfadnamen erneut öffnet, nachdem er ersetzt wurde. Ein Viewer, der nur den alten Dateihandle behält, bleibt nach der Rotation im Archiv.

Das Log erfasst Lifecycle-Nachrichten, Routen-Fehler (mit `route=` und `sessionId=` Kontext), ACP-Child stderr und — wenn `QWEN_SERVE_DEBUG=1` gesetzt ist — zusätzliche Bridge-Breadcrumbs. Zeilen, die heute an stderr gehen, gehen weiterhin an stderr; das Datei-Log ist **additiv**, kein Ersatz.

Fehlgeschlagene Standalone-Erstellung fügt `Standalone session creation failed.` mit dem validierten Ziel `sessionId`, fehlgeschlagenem `phase`, sicherem `reason`, `dispatchState` und `cleanupOutcome` hinzu. Child-Erstellung behält die Child-ID bei und zeichnet den validierten Parent separat als `relatedSessionId` auf. Korrelieren Sie `source_persistence_failed`-Zeilen über die Session-ID für private Source-Acknowledgement oder Transport-Details; `write_not_confirmed` identifiziert keine Dateisystem-Ursache. Eine abgeschlossene Quarantäne ist unterschiedlich vom Rollback, und `unknown` begründet keinen Cleanup-Erfolg. Öffentliche Fehlercodes und Retry-Verhalten bleiben unverändert. Diese Diagnosen lassen rohe Ursachen, Prompts und Source-Payloads weg.

Die aktive Datei rotiert, bevor sie 10 MiB überschreitet. Jede Familie behält vier Archive unter `archive/`, und jeder Datensatz ist auf 256 KiB begrenzt. Die In-Memory-Warteschlange akzeptiert maximal 4 MiB an nicht abgearbeiteten Dateinutzdaten. Warteschlangendruck, Rotationsfehler oder Dateisystemfehler können daher Dateikopien verwerfen; `GET /daemon/status?detail=full` zeigt Logger-Status, Probleme und Zähler für verworfene Datensätze/Bytes an.

Nur ein Daemon darf die stabile Familie in einem Log-Namensraum besitzen. Ein gleichzeitiger Daemon schreibt in `debug/daemon/runs/run-<runId>/daemon.log`; das Startbanner und der vollständige Status enthalten den maßgeblichen Pfad. `runs/recent-fallback` ist ein best-effort-Locator für eine kürzliche Fallback-Familie und kann auf eine zeigen, die noch aktiv ist. Ein gesunder Namensraum konvergiert gegen etwa 100 MiB: etwa 50 MiB für stabil plus eine inaktive Fallback-Familie. Aktive oder noch nicht veraltete Fallback-Familien werden beibehalten, sodass gleichzeitige Daemons oder Crash-/Neustart-Stürme vorübergehend mehr Platz beanspruchen können.

Ein Runtime-Verzeichnis ist ein Besitz- und Aufbewahrungs-Namensraum. Verwenden Sie unterschiedliche `QWEN_RUNTIME_DIR`-Werte, wenn Daemons unabhängige Historien benötigen. Neue Daemon-Log-Verzeichnisse sind privat für den Benutzer (`0700`), und neue Dateien verwenden `0600` unter POSIX. Es gibt keine altersbasierte Ablaufzeit.

### Deaktivierung

Setze `QWEN_DAEMON_LOG_FILE=0` (oder `false`/`off`/`no`), um das Datei-Logging vollständig zu überspringen. Die Stderr-Ausgabe bleibt unberührt.

### Beziehung zu Session-Debug-Logs

Session-spezifische Debug-Logs (`~/.qwen/debug/<sessionId>.txt` und der `~/.qwen/debug/latest`-Symlink) sind unabhängig. Das Daemon-Log liegt in einem Geschwister-Unterverzeichnis `daemon/`; die Debug-Semantik pro Session wird durch dieses Feature nicht geändert.

### Externe Rotation

Zeigen Sie keine externe logrotate-Regel auf die aktive `daemon.log`. Der Daemon ist der einzige unterstützte Schreiber und Rotator; externes Umbenennen, Löschen oder Kürzen invalidiert sein Größenmodell. Das Kopieren oder Versenden von Datensätzen ohne Änderung der Familie ist sicher. Ältere `serve-<pid>.log`- und `serve-<pid>-<workspaceHash>.log`-Dateien bleiben unberührt und werden von der neuen Aufbewahrungsrichtlinie nicht gezählt.

## Runtime-MCP-Server-Verwaltung (Issue [#4514](https://github.com/QwenLM/qwen-code/issues/4514)) [#runtime-mcp-server-management-issue-4514]

Füge MCP-Server zur Laufzeit hinzu oder entferne sie, ohne den Daemon neu zu starten. Runtime-Einträge leben in einem ephemeren Overlay, das gleichnamige, über Settings definierte Server **beschattet**; die zugrundeliegende `settings.json` / `mcpServers`-Config wird niemals beschrieben.

**Pre-Flight:** Prüfe `caps.features` auf `mcp_server_runtime_mutation`, bevor du eine der beiden Routen aufrufst. Ältere Daemons ohne diesen Tag geben `404` zurück.

### `POST /workspace/mcp/servers` — einen Runtime-MCP-Server hinzufügen

Strikt gegatet (vertrauenswürdiger Loopback-Primary oder Operator-Credentials erforderlich). Verbindet den Server sofort über den aktiven `McpClientManager` und entdeckt dessen Tools.

Request:

```json
{
  "name": "my-server",
  "config": {
    "command": "npx",
    "args": ["-y", "@my-org/mcp-server"]
  }
}
```

`name` muss alphanumerisch sein, plus `_` und `-` (max. 256 Zeichen). `config` ist dasselbe MCP-Server-Konfigurationsobjekt, das in `settings.json` `mcpServers`-Einträgen verwendet wird (transportabhängige Felder: `command`/`args` für stdio, `url` für SSE/HTTP). Sicherheitssensible Felder (`trust`, `env`, `cwd`, `oauth`, `headers`, `authProviderType`, `includeTools`, `excludeTools`, `type`) werden vom Daemon entfernt und ignoriert.

Response (200) — Erfolg:

```json
{
  "name": "my-server",
  "transport": "stdio",
  "replaced": false,
  "shadowedSettings": false,
  "toolCount": 3,
  "originatorClientId": "client-1"
}
```

- `replaced: true` — ein Runtime-Eintrag mit demselben Namen existierte bereits und der Config-Fingerprint weicht ab; alte Verbindung abgebaut, neue aufgebaut. Wenn der Fingerprint übereinstimmt (idempotentes erneutes Hinzufügen), ist `replaced` `false`.
- `shadowedSettings: true` — ein über Settings definierter Server mit demselben Namen existiert; der Runtime-Eintrag beschattet ihn jetzt. Der Settings-Eintrag bleibt unberührt und taucht wieder auf, wenn der Runtime-Eintrag später entfernt wird.
- `toolCount` — Anzahl der auf dem neu verbundenen Server entdeckten Tools.

Response (200) — Soft-Refuse (Budget-Warning-Modus):

```json
{
  "name": "my-server",
  "skipped": true,
  "reason": "budget_warning_only"
}
```

Wird zurückgegeben, wenn `--mcp-budget-mode=warn` gesetzt ist und das Hinzufügen des Servers das konfigurierte `--mcp-client-budget` überschreiten würde. Der Server wird NICHT verbunden. Caller sollten den Budget-Druck dem Benutzer anzeigen.

Fehler:

| Status | Code                      | Wann                                                                                               |
| ------ | ------------------------- | -------------------------------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Name leer, überschreitet 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]`            |
| `400`  | `missing_required_field`  | `config` fehlt oder ist kein Nicht-Null-Objekt                                                     |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Workspace registriert                   |
| `400`  | `invalid_config`          | Config-Form vom MCP-Transport-Validator abgelehnt                                                  |
| `401`  | `token_required`          | Nicht-vertrauenswürdige tokenlose Anfrage vom strikten Gate abgelehnt                                |
| `409`  | `mcp_budget_would_exceed` | `--mcp-budget-mode=enforce` und Budget ist voll                                                    |
| `502`  | `mcp_server_spawn_failed` | Server-Prozess beendet oder Timeout beim Verbinden; Body enthält `serverName`, `exitCode`, `stderr`|
| `503`  | `acp_channel_unavailable` | Kein aktives ACP-Child (es wurde noch keine Session erstellt)                                      |

### `DELETE /workspace/mcp/servers/:name` — einen Runtime-MCP-Server entfernen

Strikt gegatet. Trennt die Verbindung zum Server und entfernt ihn aus dem Runtime-Overlay. Idempotent — das Entfernen eines Namens, der nie hinzugefügt wurde, gibt eine Skip-Response zurück (keinen Fehler).

Der `:name`-Pfadparameter ist der URL-kodierte Servername.

Response (200) — Erfolg:

```json
{
  "name": "my-server",
  "removed": true,
  "wasShadowingSettings": false,
  "originatorClientId": "client-1"
}
```

- `wasShadowingSettings: true` — der entfernte Runtime-Eintrag hatte einen über Settings definierten Server mit demselben Namen beschattet. Dieser Settings-Eintrag ist jetzt nicht mehr beschattet und wird bei der nächsten Discovery / beim nächsten Neustart verwendet.

Response (200) — idempotenter Skip:

```json
{
  "name": "ghost",
  "skipped": true,
  "reason": "not_present"
}
```

Wird zurückgegeben, wenn der Name nicht im Runtime-Overlay war (er kann noch in den Settings existieren — Settings-Einträge können nicht über diese Route entfernt werden).

Fehler:

| Status | Code                      | Wann                                                                          |
| ------ | ------------------------- | ----------------------------------------------------------------------------- |
| `400`  | `invalid_server_name`     | Name leer, überschreitet 256 Zeichen oder enthält Zeichen außerhalb von `[A-Za-z0-9_-]` |
| `400`  | `invalid_client_id`       | `X-Qwen-Client-Id`-Header vorhanden, aber nicht für diesen Workspace registriert        |
| `401`  | `token_required`          | Nicht-vertrauenswürdige tokenlose Anfrage vom strikten Gate abgelehnt                 |
| `503`  | `acp_channel_unavailable` | Kein aktives ACP-Child                                                              |

### Shadow-Semantik

Runtime-Einträge bilden ein ephemeres Overlay über den über Settings definierten MCP-Servern:

- **Hinzufügen** eines Runtime-Servers mit demselben Namen wie ein Settings-Eintrag **beschattet** diesen — die Runtime-Config hat Vorrang. Der ursprüngliche Settings-Eintrag wird nicht verändert.
- **Entfernen** eines Runtime-Servers, der einen Settings-Eintrag beschattet hatte, **hebt die Beschattung auf** — die über Settings definierte Config wird bei der nächsten Verbindung wieder aktiv.
- **Daemon-Neustart** verwirft alle Runtime-Einträge. Nur über Settings definierte Server überstehen Neustarts. Runtime-Server sind auf die Lebensdauer der Session beschränkt.
- **`GET /workspace/mcp`** meldet die zusammengeführte Ansicht — sowohl über Settings definierte als auch Runtime-Server erscheinen im `servers[]`-Array. Im Snapshot gibt es heute keine Unterscheidung auf Wire-Ebene zwischen den beiden Ursprüngen.

### Events

Beide Routen emittieren **Workspace-weite** SSE-Events (alle aktiven Session-Busse empfangen sie):

| Event                | Emittiert wenn                | Payload-Felder                                                                         |
| -------------------- | ----------------------------- | -------------------------------------------------------------------------------------- |
| `mcp_server_added`   | `POST` erfolgreich (nicht übersprungen) | `name`, `transport`, `replaced`, `shadowedSettings`, `toolCount`, `originatorClientId` |
| `mcp_server_removed` | `DELETE` erfolgreich (nicht übersprungen) | `name`, `wasShadowingSettings`, `originatorClientId`                                   |

Übersprungene Antworten (`budget_warning_only`, `not_present`) lösen KEINE Events aus.

Budgetbezogene Events aus der bestehenden `mcp_guardrail_events`-Surface (`mcp_budget_warning`, `mcp_child_refused_batch`) werden auch dann ausgelöst, wenn zur Laufzeit hinzugefügte Elemente die Budget-Schwelle überschreiten.

## Nächste Schritte

- **Ein langlaufenden Daemon einrichten?** Nutzen Sie die [Local Launch Templates (systemd / launchd / nohup / tmux)](./qwen-serve-deploy-local.md) für Service-Manager-Supervision und Start nach Reboot.
- **Einen Client entwickeln?** Siehe den [DaemonClient TypeScript Quickstart](../developers/examples/daemon-client-quickstart.md) und die [HTTP-Protokollreferenz](../developers/qwen-serve-protocol.md).
- **Den Quellcode lesen?** Der Bridge-Code befindet sich unter `packages/cli/src/serve/`; der SDK-Client unter `packages/sdk-typescript/src/daemon/`.
- **Die Roadmap verfolgen?** Stage 1.5 / Stage 2-Fortschritt wird im Issue [#3803](https://github.com/QwenLM/qwen-code/issues/3803) getrackt.
