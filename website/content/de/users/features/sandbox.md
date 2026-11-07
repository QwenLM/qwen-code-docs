# Sandbox

Dieses Dokument erläutert die Tool-Ausführungsisolierung unter Linux und die vorhandenen Whole-CLI-Sandbox-Methoden.

## Linux-Tool-Ausführungssandbox

Unter Linux installieren Sie `bwrap` (Bubblewrap) unter `/usr/bin/bwrap` (dem unterstützten Systempfad) für die stärkste unterstützte Grenze und aktivieren dann die Tool-Ausführungssandbox in Ihren **Benutzer**-Einstellungen (`~/.qwen/settings.json` oder dem von `QWEN_HOME` ausgewählten Verzeichnis) oder den **System**-Einstellungen des Administrators:

```json
{
  "tools": {
    "executionSandbox": {
      "backend": "auto",
      "filesystem": "workspace-write",
      "network": "closed"
    }
  }
}
```

`filesystem` und `network` sind erforderlich. `backend` ist standardmäßig `auto` und versucht zuerst bwrap. Wenn bwrap nicht verfügbar ist und `network` auf `open` gesetzt ist, kann `auto` den mitgelieferten Landlock-Helper auf Kerneln mit Landlock ABI 3 oder neuer verwenden. Setzen Sie `backend` auf `bwrap` oder `landlock`, um genau diese Implementierung zu erfordern. Landlock kann `network: closed` nicht erzwingen oder explizit maskierte Pfade ausblenden. Jede dieser Anforderungen lehnt Landlock ab, bevor ein Befehl startet; der automatische Fallback verwirft niemals eine verbleibende Pfadmaske. Verwenden Sie `read-only`, um Workspace-Schreibzugriffe zu verweigern, oder `workspace-write`, um Schreibzugriffe im aktuellen kanonischen Workspace zu erlauben. Jeder Befehl erhält außerdem privaten temporären Bereich. Normale `includeDirectories`-Einstellungen gewähren keinen Schreibzugriff. Halten Sie den Workspace getrennt von den Qwen-Installations-, Benutzerkonfigurations- und Laufzeitstatusverzeichnissen.

Die CLI, der Modelltransport, die Authentifizierung und der Session-Speicher verbleiben auf dem Host. Shell, Terminal-`!`, Prompt-Shell-Interpolation, Monitor, Read/Write/Edit und unterstützte verschachtelte In-Process-Agent/Code-Mode-Aufrufe verwenden dieselbe Laufzeitrichtlinie. Mit bwrap blockiert `network: closed` normale Host/externe IP-Verbindungen von Befehlen, während `open` das Host-Netzwerk teilt. Lesezugriffe bleiben breit: Dieser Modus versteckt keine Host-Secrets und verspricht nicht, Pfadnamen-Unix-Sockets und Host-Dienste zu isolieren. Genehmigung und YOLO erweitern die Dateisystem- oder Netzwerkrichtlinie nicht. Standard-Streams sind explizit vom Aufrufer bereitgestellte Fähigkeiten: Ein bereits verbundener Socket, TTY oder Zeichengerät bleibt auch bei `network: closed` verwendbar. Geschlossenes Networking widerruft diese bestehenden Deskriptoren nicht; vermeiden Sie es, eine Host-Dienst-Verbindung als stdin bereitzustellen, wenn dieser Zugriff nicht gewünscht ist. Host-gestützte Datei- und Named-FIFO-stdin benötigen den mitgelieferten Linux-x64/arm64-Input-Helper und werden über einen privaten Unix-Stream-Socket kopiert, dessen Schreibhälfte geschlossen ist; reguläre Datei-Offsets rücken nur um die aus diesem Socket verbrauchten Bytes vor, und ein inaktiver FIFO-Schreiber verzögert den Befehlsabschluss nicht. Lesen Sie fd 0 direkt: Diese Eingabe ist ein Socket statt eines FIFO, und das erneute Öffnen über `/dev/stdin` oder `/proc/self/fd/0` wird nicht unterstützt. SIGINT/SIGTERM brechen den Befehl ab, lassen aber akzeptierte stdout/stderr-Bytes abfließen; eine geschlossene Ausgabe stoppt diesen Stream mit Exit 141, während die andere gültige Ausgabe abfließt.

Landlock meldet `partial` Durchsetzung, weil es Pfadnamen-Lese-, Schreib- und Verzeichnisänderungen einschränkt, aber keine PID- oder Netzwerk-Namespaces erstellt und derzeit nicht jede Metadatenoperation einschränken kann, einschließlich `chmod`, `chown`, erweiterter Attribute und Zeitstempel. Ein Landlock-Befehl kann Host-Prozesse sehen und verwendet Host-Networking. Abgetrennte Nachfahren behalten die Landlock-Dateisystem-Einschränkungen, erhalten aber nicht die PID-Namespace-Lebensdauergrenze von bwrap. Offene Dateideskriptoren behalten ihren bestehenden Zugriff. Qwen Code streamt host-gestützte Datei- und Named-FIFO-stdin über einen privaten schreibgeschützten Socket, anstatt diese Deskriptoren an die Nutzlast zu übergeben; Sockets, Zeichengeräte und anonyme Pipes können geteilt werden. Ausgabe-Standard-Streams bleiben die expliziten Ziele des Aufrufers. Der Ausführungsstatus-Deskriptor wird bei der Payload-Ausführung geschlossen.

Landlock hat auch eine schmälere beschreibbare Geräteoberfläche: Es gewährt Schreibzugriffe auf `/dev/null`, erstellt aber nicht die privaten `/dev`- und `/proc`-Mounts von bwrap. Das Öffnen von `/dev/full` oder `/dev/tty` zum Schreiben und das Erstellen von Dateien in `/dev/shm` wird verweigert, daher können Programme, die diese Operationen benötigen, fehlschlagen. Verwenden Sie das private temporäre Verzeichnis, das über `TMPDIR`, `TMP` und `TEMP` verfügbar gemacht wird, für temporäre Dateien. Bereits offene, vom Aufrufer bereitgestellte Standard-Streams behalten ihren bestehenden Zugriff. Der Landlock-Richtlinien-Test beim Start benötigt `/usr/bin/true`; ein Host, dem es fehlt, schlägt beim Test fehl, selbst wenn sein Kernel Landlock unterstützt.

Workspace-Einstellungen können diese Richtlinie nicht aktivieren, deaktivieren oder ändern, selbst in einem vertrauenswürdigen Projekt. Die effektive Priorität ist System vor Benutzer vor SystemDefaults, wobei ein vollständiges Richtlinienobjekt ausgewählt wird. Werte müssen Literale sein; Umgebungssubstitutionen, unbekannte Felder und unvollständige Objekte werden abgelehnt. `--bare` und `--safe-mode` behalten die Operator-Einschränkung bei. Änderungen erfordern eine neue Laufzeit. Eine fehlerhafte oder unlesbare SystemDefaults-, Benutzer- oder System-Einstellungsdatei blockiert jetzt den Start (Konfigurations-Exit-Code 52), anstatt unbekannte Richtlinien still auf leere Einstellungen zurückzusetzen. Der Fehler benennt die Datei und die Reparaturaktion. Reparieren Sie deren JSON-Objekt oder stellen Sie den Lesezugriff wieder her, dann starten Sie neu. Eine Benutzer-`.corrupted`-Kopie ist nur eine Referenz; die ursprüngliche Operator-Datei wird niemals gelöscht. Die nur-Workspace-Wiederherstellung bleibt ohne Operator-Einschränkung verfügbar. Fehlerhafte verlinkte Workspace-Einstellungen (einschließlich eines verlinkten `.qwen`-Verzeichnisses oder einer hart verlinkten Datei) erfordern manuelle Reparatur; die automatische Wiederherstellung verweigert vor dem Ändern des Originals oder einer früheren Korruptionskopie. Gültige verlinkte JSON bleibt lesbar.

Dieser anfängliche öffentliche Modus unterstützt die normale Headless-CLI und beide Terminal-UIs. ACP, `qwen serve` und Web-Terminals lehnen ihn explizit ab. MCP/LSP, ausführbare Hooks/Extensions, Worktree/Arena-Management, externe Agenten, spekulative Ausführung, Datei-Checkpoints, automatische Skill/Memory-Wartung und nicht portierte Prozess- oder Mutations-Tools werden deaktiviert oder abgelehnt. Normale In-Process-Agenten im selben Workspace können keine Hooks, MCP-Server, externe Executoren oder Worktree-Isolation hinzufügen. Benutzerdefinierte Statusbefehle, externe Markdown/Bild-Renderer, IDE-Erkennung und -Verbindung, Dateiwiederherstellung und Host-Git-Diff-Vorschauen sind deaktiviert. Nur-Konversations-Rewind bleibt verfügbar.

Explizite Operator-Diagnosen wie `/doctor`, das Öffnen oder Bearbeiten von Dateien und Ordnern über `/memory` und das Ändern von Einstellungen über `/skills` bleiben vertrauenswürdige Host-Aktionen. Diese Verwaltungsbefehle werden nicht als modellaufrufbare Befehle bereitgestellt. Das Auswählen eines Skills füllt das Eingabefeld; das Einreichen von `/skill-name` meldet derzeit einen Unsupported-Mode-Fehler, bevor Argumente vorbereitet oder Nutzungsdatensätze aktualisiert werden. Skill-Befehlsausführung und das Modell-Skill-Tool bleiben nicht verfügbar, bis ihre Vorbereitungsschreibvorgänge eingeschränkt sind. Automatische Memory- und Skill-Wartung bleibt in dieser Laufzeit deaktiviert, selbst wenn Sie ihre gespeicherten Einstellungen ändern.

Untersuchen und überprüfen Sie die aktive Grenze, bevor Sie eine Aufgabe ausführen:

```bash
qwen sandbox
qwen sandbox --verify
qwen sandbox -- sh -c 'printf "confined command\n"'
qwen -y -p "Update the project and run its tests"
```

Verlinkte Git-Worktrees erhalten Schreibzugriff nur auf den zugelassenen Workspace. Git-Common-Directory- und Worktree-Metadaten außerhalb dieses Workspaces bleiben schreibgeschützt; dieser Modus autorisiert nicht implizit das Ändern der Repository-Metadaten eines anderen Checkouts. Operationen, die diese Schreibvorgänge erfordern, können abgelehnt werden.

Der Bericht benennt die Tool-Grenze, angeforderten/effektiven Backend, Durchsetzungsebene, Landlock-ABI falls zutreffend, Workspace, Dateisystem- und Befehls-Netzwerkrichtlinie. `--verify` prüft Workspace-Schreibvorgänge, Ablehnung gegen eine auf dem Host bekannt schreibbare Datei, die erwartete private oder geteilte PID-Namespace-Identität und den ausgewählten Netzwerk-Namespace. Eine bestandene Backend-Prüfung stellt die Zulassung fest, nicht die authentifizierte vollständige Session-Tauglichkeit unter allen geerbten Umgebungseinstellungen. Führen Sie danach eine normale Aufgabe aus, um ihre benötigten Tools und Dienste zu testen. Wenn die Überprüfung ihr hostseitiges temporäres Fixture nicht erstellen kann, überprüfen Sie `TMPDIR` und Verzeichnisberechtigungen; dies ist getrennt von einer Grenzablehnung. Backend-Einrichtungsfehler schlagen vor der Payload-Ausführung fehl und führen den Befehl niemals erneut auf dem Host aus. Der Ein-Befehl-Unterbefehl leitet wörtliche Argumente und umgeleitete stdin weiter, während stdout und stderr Byte für Byte erhalten bleiben; verwenden Sie Terminal-`!` für interaktive PTY-Befehle.

### Migration von der Whole-CLI-bwrap

Ersetzen Sie `--sandbox bwrap` und entfernen Sie `tools.sandbox: "bwrap"`, `QWEN_SANDBOX=bwrap`, `QWEN_SANDBOX_NET` und `QWEN_SANDBOX_PROXY_COMMAND`, dann konfigurieren Sie `tools.executionSandbox` wie oben. Starten Sie aus einer Shell außerhalb der alten Sandbox neu; geerbtes `SANDBOX=bwrap` wird abgelehnt. `proxied` ist keine unterstützte Netzwerkrichtlinie. Kombinieren Sie diesen Modus nicht mit Docker, Podman, Seatbelt oder einem geerbten Whole-CLI-Sandbox-Marker. Alte bwrap-Einstellungen erzeugen einen expliziten Migrationsfehler.

Die Docker-, Podman- und macOS-Seatbelt-Methoden unten führen weiterhin die gesamte CLI in ihrer bestehenden Umgebung aus.

## Voraussetzungen

Bevor Sie die Sandbox nutzen, müssen Sie Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

Um die Installation zu überprüfen:

```bash
qwen --version
```

## Überblick über die Sandbox

Die Sandbox isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von Ihrem Hostsystem und bietet eine Sicherheitsbarriere zwischen der CLI und Ihrer Umgebung.

Zu den Vorteilen der Sandbox gehören:

- **Sicherheit**: Verhindert versehentliche Systemschäden oder Datenverlust.
- **Isolation**: Beschränkt den Dateisystemzugriff auf das Projektverzeichnis.
- **Konsistenz**: Stellt reproduzierbare Umgebungen auf verschiedenen Systemen sicher.
- **Sicherheit**: Verringert das Risiko bei der Arbeit mit nicht vertrauenswürdigem Code oder experimentellen Befehlen.

> [!note]
>
> **Hinweis zur Namensgebung:** Einige sandboxbezogene Umgebungsvariablen haben historisch das `GEMINI_*`-Präfix verwendet. Alle neuen Umgebungsvariablen verwenden das `QWEN_*`-Präfix.

## Sandbox-Methoden

Ihre ideale Sandbox-Methode kann je nach Plattform und bevorzugter Containerlösung variieren.

### 1. macOS Seatbelt (nur macOS)

Leichte, integrierte Sandbox mittels `sandbox-exec`.

**Standardprofil**: `permissive-open` – schränkt Schreibzugriffe außerhalb des Projektverzeichnisses ein, erlaubt aber die meisten anderen Operationen und ausgehenden Netzwerkzugriff.

**Am besten geeignet für**: Schnell, kein Docker erforderlich, starke Schutzvorkehrungen für Dateischreibvorgänge.

### 2. Containerbasiert (Docker/Podman)

Plattformübergreifende Sandbox mit vollständiger Prozessisolation.

Standardmäßig verwendet Qwen Code ein veröffentlichtes Sandbox-Image (konfiguriert im CLI-Paket) und lädt es bei Bedarf herunter.

Die Container-Sandbox mountet Ihren Arbeitsbereich und Ihr `~/.qwen`-Verzeichnis in den Container, sodass Authentifizierung und Einstellungen zwischen den Ausführungen erhalten bleiben.

**Am besten geeignet für**: Starke Isolation auf jedem Betriebssystem, konsistente Werkzeuge in einem bekannten Image.

### Auswahl einer Methode

- **Auf macOS**:
  - Verwenden Sie Seatbelt, wenn Sie eine leichte Sandbox wünschen (für die meisten Benutzer empfohlen).
  - Verwenden Sie Docker/Podman, wenn Sie eine vollständige Linux-Benutzerumgebung benötigen (z.B. Tools, die Linux-Binärdateien erfordern).
- **Auf Linux/Windows**:
  - Verwenden Sie Docker oder Podman.

## Schnellstart

```bash
# Sandbox mit Befehlsflag aktivieren
qwen -s -p "analyze the code structure"

# Oder Sandbox für die Shell-Sitzung aktivieren (empfohlen für CI/Skripte)
export QWEN_SANDBOX=true   # true wählt automatisch einen Provider aus (siehe Hinweise unten)
qwen -p "run the test suite"

# In settings.json konfigurieren
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **Hinweise zur Provider-Auswahl:**
>
> - Unter **macOS** wählt `QWEN_SANDBOX=true` in der Regel `sandbox-exec` (Seatbelt), sofern verfügbar.
> - Unter **Linux/Windows** erfordert `QWEN_SANDBOX=true`, dass `docker` oder `podman` installiert ist.
> - Um einen Provider zu erzwingen, setzen Sie `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Konfiguration

### Sandbox aktivieren (in der Reihenfolge der Priorität)

1. **Umgebungsvariable**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Befehlsflag / Argument**: `-s`, `--sandbox` oder `--sandbox=<provider>`
3. **Einstellungsdatei**: `tools.sandbox` in Ihrer `settings.json` (z.B. `{"tools": {"sandbox": true}}`).

> [!important]
>
> Wenn `QWEN_SANDBOX` gesetzt ist, **überschreibt** es das CLI-Flag und die `settings.json`.

`--sandbox` und `-s` akzeptieren einen optionalen Wert: `true`, `false`, `docker`, `podman` oder `sandbox-exec`. Für automatische Auswahl mit Prompt verwenden Sie `qwen --sandbox=true "query"` oder `qwen --sandbox -p "query"`. Im Gegensatz zum alten rein-booleschen Parser behandelt `qwen --sandbox "query"` jetzt `query` als Backend-Wert und lehnt ein unbekanntes Backend ab. Optionen vor `--` verwenden dieselbe Grammatik auch nach positionalen Wörtern; verwenden Sie `-p "..."` für wörtlichen Optionstext innerhalb eines Prompts. `--` stoppt die Optionsverarbeitung, aber seine nachfolgenden Token werden nicht als Prompt für den Standardbefehl weitergeleitet. Session-Sandbox-Flags werden bei Verwaltungs-Unterbefehlen nicht akzeptiert, deren `-s`-Aliase ihre eigene Bedeutung behalten.

### Sandbox-Image konfigurieren (Docker/Podman)

- **CLI-Flag**: `--sandbox-image <image>`
- **Umgebungsvariable**: `QWEN_SANDBOX_IMAGE=<image>`
- **Einstellungsdatei**: `tools.sandboxImage` in Ihrer `settings.json` (z.B. `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

Prioritätsreihenfolge (höchste zu niedrigste):

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. Integriertes Standard-Image aus dem CLI-Paket (z.B. `ghcr.io/qwenlm/qwen-code:<version>`)

`settings.env.QWEN_SANDBOX_IMAGE` funktioniert ebenfalls als generischer Env-Injektionsmechanismus, aber `tools.sandboxImage` ist die bevorzugte persistente Einstellung.

Benutzerdefinierte Images werden vom Benutzer verwaltet. Baue sie mit einer aktuellen Qwen Code-Installation neu, um die sichere Update-Übergabe zu erhalten; ältere Images verwenden möglicherweise noch ihren ursprünglichen In-Process-Updater.

### macOS Seatbelt-Profile

Integrierte Profile (gesetzt über die Umgebungsvariable `SEATBELT_PROFILE`):

- `permissive-open` (Standard): Schreibbeschränkungen, Netzwerk erlaubt
- `permissive-closed`: Schreibbeschränkungen, kein Netzwerk
- `permissive-proxied`: Schreibbeschränkungen, Netzwerk über Proxy
- `restrictive-open`: Strenge Beschränkungen, Netzwerk erlaubt
- `restrictive-closed`: Maximale Beschränkungen
- `restrictive-proxied`: Strenge Beschränkungen, Netzwerk über Proxy

> [!tip]
>
> Beginnen Sie mit `permissive-open`, und verschärfen Sie dann auf `restrictive-closed`, wenn Ihr Workflow noch funktioniert.

### Benutzerdefinierte Seatbelt-Profile (macOS)

So verwenden Sie ein benutzerdefiniertes Seatbelt-Profil:

1. Erstellen Sie eine Datei namens `.qwen/sandbox-macos-<profile_name>.sb` in Ihrem Projekt.
2. Setzen Sie `SEATBELT_PROFILE=<profile_name>`.

### Benutzerdefinierte Sandbox-Flags

Für containerbasierte Sandbox können Sie benutzerdefinierte Flags in den `docker`- oder `podman`-Befehl einfügen, indem Sie die Umgebungsvariable `SANDBOX_FLAGS` verwenden. Dies ist nützlich für erweiterte Konfigurationen, wie das Deaktivieren von Sicherheitsfunktionen für bestimmte Anwendungsfälle.

**Beispiel (Podman)**:

Um die SELinux-Kennzeichnung für Volume-Mounts zu deaktivieren, können Sie Folgendes setzen:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Mehrere Flags können als durch Leerzeichen getrennte Zeichenfolge angegeben werden:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Netzwerk-Proxy (alle Sandbox-Methoden)

Wenn Sie den ausgehenden Netzwerkzugriff auf eine Whitelist beschränken möchten, können Sie einen lokalen Proxy zusammen mit der Sandbox ausführen:

- Setzen Sie `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- Der Befehl muss einen Proxy-Server starten, der auf `:::8877` lauscht.

Dies ist besonders nützlich mit `*-proxied` Seatbelt-Profilen.

Ein funktionierendes Beispiel für einen Whitelist-Proxy finden Sie unter: [Beispiel-Proxy-Skript](../../developers/examples/proxy-script.md).

## Linux UID/GID-Handhabung

Unter Linux aktiviert Qwen Code standardmäßig das UID/GID-Mapping, sodass die Sandbox als Ihr Benutzer läuft (und das gemountete `~/.qwen` wiederverwendet). Überschreiben Sie dies mit:

```bash
export SANDBOX_SET_UID_GID=true   # Host UID/GID erzwingen
export SANDBOX_SET_UID_GID=false  # UID/GID-Mapping deaktivieren
```

## Fehlerbehebung

### Häufige Probleme

**"Operation not permitted"**

- Der Vorgang erfordert Zugriff außerhalb der Sandbox.
- Bei macOS Seatbelt: Versuchen Sie ein permissiveres `SEATBELT_PROFILE`.
- Bei Docker/Podman: Überprüfen Sie, ob der Arbeitsbereich gemountet ist und Ihr Befehl keinen Zugriff außerhalb des Projektverzeichnisses erfordert.

**Fehlende Befehle**

- Container-Sandbox: Fügen Sie sie über `.qwen/sandbox.Dockerfile` oder `.qwen/sandbox.bashrc` hinzu.
- Seatbelt: Ihre Host-Binärdateien werden verwendet, aber die Sandbox kann den Zugriff auf einige Pfade einschränken.

**Java nicht in der Docker-Sandbox verfügbar**

Das offizielle Qwen Code Docker-Image ist bewusst minimalistisch gehalten, um das Image klein, sicher und schnell pullbar zu machen. Verschiedene Benutzer benötigen unterschiedliche Laufzeitumgebungen (Java, Python, Node.js usw.), und es ist nicht praktikabel, alle Umgebungen in ein einziges Image zu packen. Daher ist Java **standardmäßig nicht enthalten** in der Docker-Sandbox.

Wenn Ihr Workflow Java erfordert, können Sie das Basis-Image erweitern, indem Sie eine `.qwen/sandbox.Dockerfile` in Ihrem Projekt erstellen:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Dann bauen Sie das Sandbox-Image neu:

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Weitere Details zur Anpassung der Sandbox finden Sie unter [Anpassen der Sandbox-Umgebung](../../developers/tools/sandbox.md).

**Netzwerkprobleme**

- Überprüfen Sie, ob das Sandbox-Profil Netzwerk erlaubt.
- Überprüfen Sie die Proxy-Konfiguration.

### Debug-Modus

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Hinweis:** Wenn Sie `DEBUG=true` in einer `.env`-Datei eines Projekts haben, wirkt sich dies aufgrund des automatischen Ausschlusses nicht auf die CLI aus. Verwenden Sie `.qwen/.env`-Dateien für Qwen Code-spezifische Debug-Einstellungen.

### Sandbox inspizieren

```bash
# Umgebung überprüfen
qwen -s -p "run shell command: env | grep SANDBOX"

# Mounts auflisten
qwen -s -p "run shell command: mount | grep workspace"
```

## Sicherheitshinweise

- Die Sandbox verringert, beseitigt aber nicht alle Risiken.
- Verwenden Sie das restriktivste Profil, das Ihre Arbeit erlaubt.
- Der Container-Overhead ist nach dem ersten Pull/Build minimal.
- GUI-Anwendungen funktionieren möglicherweise nicht in Sandboxes.

## Verwandte Dokumentation

- [Konfiguration](../configuration/settings): Vollständige Konfigurationsoptionen.
- [Befehle](../features/commands): Verfügbare Befehle.
- [Fehlerbehebung](../support/troubleshooting): Allgemeine Fehlerbehebung.