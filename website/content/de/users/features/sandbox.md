# Sandbox

Dieses Dokument erklärt, wie du Qwen Code in einer Sandbox ausführst, um das Risiko zu verringern, wenn Tools Shell-Befehle ausführen oder Dateien ändern.

## Voraussetzungen

Bevor du Sandboxing verwendest, musst du Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

So überprüfst du die Installation

```bash
qwen --version
```

## Überblick über Sandboxing

Sandboxing isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von deinem Hostsystem und bietet eine Sicherheitsbarriere zwischen der CLI und deiner Umgebung.

Die Vorteile von Sandboxing sind:

- **Sicherheit**: Verhindere versehentliche Systembeschädigungen oder Datenverlust.
- **Isolation**: Beschränke den Dateisystemzugriff auf das Projektverzeichnis.
- **Konsistenz**: Stelle reproduzierbare Umgebungen über verschiedene Systeme hinweg sicher.
- **Schutz**: Verringere das Risiko bei der Arbeit mit nicht vertrauenswürdigem Code oder experimentellen Befehlen.

> [!note]
>
> **Hinweis zur Benennung:** Einige Sandbox-bezogene Umgebungsvariablen verwendeten historisch möglicherweise das `GEMINI_*`-Präfix. Alle neuen Umgebungsvariablen verwenden das `QWEN_*`-Präfix.

## Sandboxing-Methoden

Die ideale Sandboxing-Methode hängt von deiner Plattform und deiner bevorzugten Container-Lösung ab.

### 1. macOS Seatbelt (nur macOS)

Leichtgewichtiges, integriertes Sandboxing mit `sandbox-exec`.

**Standardprofil**: `permissive-open` – Beschränkt Schreibzugriffe außerhalb des Projektverzeichnisses, erlaubt aber die meisten anderen Operationen und ausgehenden Netzwerkzugriff.

**Ideal für**: Schnelle Ausführung, kein Docker erforderlich, starke Schutzvorkehrungen für Dateischreibvorgänge.

### 2. Container-basiert (Docker/Podman)

Plattformübergreifendes Sandboxing mit vollständiger Prozessisolation.

Standardmäßig verwendet Qwen Code ein veröffentlichtes Sandbox-Image (konfiguriert im CLI-Paket) und lädt es bei Bedarf herunter.

Die Container-Sandbox bindet deinen Workspace und dein `~/.qwen`-Verzeichnis in den Container ein, sodass Authentifizierung und Einstellungen zwischen den Ausführungen erhalten bleiben.

**Ideal für**: Starke Isolation auf jedem Betriebssystem, konsistente Tooling-Umgebung innerhalb eines bekannten Images.

### Auswahl einer Methode

- **Unter macOS**:
  - Verwende Seatbelt für leichtgewichtiges Sandboxing (empfohlen für die meisten Nutzer).
  - Verwende Docker/Podman, wenn du eine vollständige Linux-Userland-Umgebung benötigst (z. B. für Tools, die Linux-Binaries erfordern).
- **Unter Linux/Windows**:
  - Verwende Docker oder Podman.

## Schnellstart

```bash
# Enable sandboxing with command flag
qwen -s -p "analyze the code structure"

# Or enable sandboxing for your shell session (recommended for CI / scripts)
export QWEN_SANDBOX=true   # true auto-picks a provider (see notes below)
qwen -p "run the test suite"

# Configure in settings.json
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
> - Unter **macOS** wählt `QWEN_SANDBOX=true` typischerweise `sandbox-exec` (Seatbelt), falls verfügbar.
> - Unter **Linux/Windows** erfordert `QWEN_SANDBOX=true`, dass `docker` oder `podman` installiert ist.
> - Um einen Provider zu erzwingen, setze `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Konfiguration

### Sandboxing aktivieren (in Reihenfolge der Priorität)

1. **Umgebungsvariable**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Befehlsflag / Argument**: `-s`, `--sandbox` oder `--sandbox=<provider>`
3. **Einstellungsdatei**: `tools.sandbox` in deiner `settings.json` (z. B. `{"tools": {"sandbox": true}}`).

> [!important]
>
> Wenn `QWEN_SANDBOX` gesetzt ist, **überschreibt** es das CLI-Flag und die `settings.json`.

### Sandbox-Image konfigurieren (Docker/Podman)

- **CLI-Flag**: `--sandbox-image <image>`
- **Umgebungsvariable**: `QWEN_SANDBOX_IMAGE=<image>`

Wenn du keines von beiden setzt, verwendet Qwen Code das im CLI-Paket konfigurierte Standard-Image (z. B. `ghcr.io/qwenlm/qwen-code:<version>`).

### macOS Seatbelt-Profile

Integrierte Profile (wird über die Umgebungsvariable `SEATBELT_PROFILE` gesetzt):

- `permissive-open` (Standard): Schreibbeschränkungen, Netzwerk erlaubt
- `permissive-closed`: Schreibbeschränkungen, kein Netzwerk
- `permissive-proxied`: Schreibbeschränkungen, Netzwerk über Proxy
- `restrictive-open`: Strenge Beschränkungen, Netzwerk erlaubt
- `restrictive-closed`: Maximale Beschränkungen
- `restrictive-proxied`: Strenge Beschränkungen, Netzwerk über Proxy

> [!tip]
>
> Beginne mit `permissive-open` und wechsle zu `restrictive-closed`, wenn dein Workflow weiterhin funktioniert.

### Eigene Seatbelt-Profile (macOS)

So verwendest du ein eigenes Seatbelt-Profil:

1. Erstelle eine Datei namens `.qwen/sandbox-macos-<profile_name>.sb` in deinem Projekt.
2. Setze `SEATBELT_PROFILE=<profile_name>`.

### Eigene Sandbox-Flags

Für containerbasiertes Sandboxing kannst du über die Umgebungsvariable `SANDBOX_FLAGS` eigene Flags in den `docker`- oder `podman`-Befehl injizieren. Dies ist nützlich für erweiterte Konfigurationen, z. B. zum Deaktivieren von Sicherheitsfeatures für bestimmte Anwendungsfälle.

**Beispiel (Podman)**:

Um das SELinux-Labeling für Volume-Mounts zu deaktivieren, kannst du Folgendes setzen:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Mehrere Flags können als durch Leerzeichen getrennte Zeichenkette angegeben werden:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Netzwerk-Proxying (alle Sandbox-Methoden)

Wenn du den ausgehenden Netzwerkzugriff auf eine Allowlist beschränken möchtest, kannst du einen lokalen Proxy parallel zur Sandbox ausführen:

- Setze `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- Der Befehl muss einen Proxy-Server starten, der auf `:::8877` lauscht

Dies ist besonders nützlich in Kombination mit `*-proxied` Seatbelt-Profilen.

Ein funktionierendes Beispiel für einen Allowlist-Proxy findest du hier: [Example Proxy Script](/developers/examples/proxy-script).

## Linux UID/GID-Handling

Unter Linux aktiviert Qwen Code standardmäßig das UID/GID-Mapping, sodass die Sandbox als dein Benutzer ausgeführt wird (und das eingebundene `~/.qwen` wiederverwendet). Du kannst dies überschreiben mit:

```bash
export SANDBOX_SET_UID_GID=true   # Force host UID/GID
export SANDBOX_SET_UID_GID=false  # Disable UID/GID mapping
```

## Fehlerbehebung

### Häufige Probleme

**"Operation not permitted"**

- Die Operation erfordert Zugriff außerhalb der Sandbox.
- Unter macOS Seatbelt: Versuche ein weniger restriktives `SEATBELT_PROFILE`.
- Unter Docker/Podman: Stelle sicher, dass der Workspace eingebunden ist und dein Befehl keinen Zugriff außerhalb des Projektverzeichnisses erfordert.

**Fehlende Befehle**

- Container-Sandbox: Füge sie über `.qwen/sandbox.Dockerfile` oder `.qwen/sandbox.bashrc` hinzu.
- Seatbelt: Es werden die Binaries deines Hosts verwendet, die Sandbox kann jedoch den Zugriff auf bestimmte Pfade einschränken.

**Java nicht in der Docker-Sandbox verfügbar**

Das offizielle Qwen Code Docker-Image ist bewusst minimal gehalten, um es klein, sicher und schnell herunterladbar zu machen. Unterschiedliche Nutzer benötigen verschiedene Language Runtimes (Java, Python, Node.js usw.), und das Bündeln aller Umgebungen in einem einzigen Image ist nicht praktikabel. Daher ist Java **standardmäßig nicht** in der Docker-Sandbox enthalten.

Wenn dein Workflow Java erfordert, kannst du das Basis-Image erweitern, indem du eine `.qwen/sandbox.Dockerfile` in deinem Projekt erstellst:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Baue anschließend das Sandbox-Image neu:

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Weitere Details zur Anpassung der Sandbox findest du unter [Customizing the sandbox environment](/developers/tools/sandbox).

**Netzwerkprobleme**

- Prüfe, ob das Sandbox-Profil Netzwerkzugriff erlaubt.
- Überprüfe die Proxy-Konfiguration.

### Debug-Modus

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Hinweis:** Wenn `DEBUG=true` in der `.env`-Datei eines Projekts steht, wirkt sich dies aufgrund des automatischen Ausschlusses nicht auf die CLI aus. Verwende `.qwen/.env`-Dateien für Qwen Code-spezifische Debug-Einstellungen.

### Sandbox inspizieren

```bash
# Check environment
qwen -s -p "run shell command: env | grep SANDBOX"

# List mounts
qwen -s -p "run shell command: mount | grep workspace"
```

## Sicherheitshinweise

- Sandboxing verringert, beseitigt aber nicht alle Risiken.
- Verwende das restriktivste Profil, das deine Arbeit noch ermöglicht.
- Der Container-Overhead ist nach dem ersten Pull/Build minimal.
- GUI-Anwendungen funktionieren in Sandboxes möglicherweise nicht.

## Verwandte Dokumentation

- [Configuration](../configuration/settings): Vollständige Konfigurationsoptionen.
- [Commands](../features/commands): Verfügbare Befehle.
- [Troubleshooting](../support/troubleshooting): Allgemeine Fehlerbehebung.