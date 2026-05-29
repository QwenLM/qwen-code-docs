---
description: "Verstehen Sie die Qwen Code Sandbox, begrenzen Sie riskante Befehle und Dateiaktionen und führen Sie KI-Coding-Aufgaben mit klaren Sicherheitsgrenzen aus."
---

# Sandbox

Dieses Dokument erklärt, wie du Qwen Code in einer Sandbox ausführst, um Risiken zu minimieren, wenn Tools Shell-Befehle ausführen oder Dateien ändern.

## Voraussetzungen

Bevor du Sandboxing nutzt, musst du Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

Um die Installation zu überprüfen

```bash
qwen --version
```

## Überblick über Sandboxing

Sandboxing isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von deinem Host-System und bietet eine Sicherheitsbarriere zwischen der CLI und deiner Umgebung.

Die Vorteile von Sandboxing sind:

- **Sicherheit**: Verhindert versehentliche Systembeschädigungen oder Datenverlust.
- **Isolation**: Beschränkt den Dateisystemzugriff auf das Projektverzeichnis.
- **Konsistenz**: Stellt reproduzierbare Umgebungen über verschiedene Systeme hinweg sicher.
- **Schutz**: Reduziert das Risiko bei der Arbeit mit nicht vertrauenswürdigem Code oder experimentellen Befehlen.

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

- **Auf macOS**:
  - Nutze Seatbelt für leichtgewichtiges Sandboxing (empfohlen für die meisten Nutzer).
  - Nutze Docker/Podman, wenn du eine vollständige Linux-Userland-Umgebung benötigst (z. B. für Tools, die Linux-Binaries erfordern).
- **Auf Linux/Windows**:
  - Nutze Docker oder Podman.

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
> - Auf **macOS** wählt `QWEN_SANDBOX=true` typischerweise `sandbox-exec` (Seatbelt), falls verfügbar.
> - Auf **Linux/Windows** erfordert `QWEN_SANDBOX=true`, dass `docker` oder `podman` installiert ist.
> - Um einen Provider fest vorzugeben, setze `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Konfiguration

### Sandboxing aktivieren (in Reihenfolge der Priorität)

1. **Umgebungsvariable**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **CLI-Flag / Argument**: `-s`, `--sandbox` oder `--sandbox=<provider>`
3. **Einstellungsdatei**: `tools.sandbox` in deiner `settings.json` (z. B. `{"tools": {"sandbox": true}}`).

> [!important]
>
> Wenn `QWEN_SANDBOX` gesetzt ist, **überschreibt** es das CLI-Flag und die `settings.json`.

### Sandbox-Image konfigurieren (Docker/Podman)

- **CLI-Flag**: `--sandbox-image <image>`
- **Umgebungsvariable**: `QWEN_SANDBOX_IMAGE=<image>`
- **Einstellungsdatei**: `tools.sandboxImage` in deiner `settings.json` (z. B. `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

Prioritätsreihenfolge (höchste zu niedrigste):

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. Integriertes Standard-Image aus dem CLI-Paket (z. B. `ghcr.io/qwenlm/qwen-code:<version>`)

`settings.env.QWEN_SANDBOX_IMAGE` funktioniert ebenfalls als generischer Mechanismus zur Umgebungsvariablen-Injektion, aber `tools.sandboxImage` ist die bevorzugte persistente Einstellung.

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
> Beginne mit `permissive-open` und wechsle zu `restrictive-closed`, wenn dein Workflow weiterhin funktioniert.

### Benutzerdefinierte Seatbelt-Profile (macOS)

So verwendest du ein benutzerdefiniertes Seatbelt-Profil:

1. Erstelle eine Datei namens `.qwen/sandbox-macos-<profile_name>.sb` in deinem Projekt.
2. Setze `SEATBELT_PROFILE=<profile_name>`.

### Benutzerdefinierte Sandbox-Flags

Für containerbasiertes Sandboxing kannst du über die Umgebungsvariable `SANDBOX_FLAGS` benutzerdefinierte Flags in den `docker`- oder `podman`-Befehl injizieren. Dies ist nützlich für erweiterte Konfigurationen, z. B. zum Deaktivieren von Sicherheitsfeatures für bestimmte Anwendungsfälle.

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
- Unter macOS Seatbelt: Versuche ein freizügigeres `SEATBELT_PROFILE`.
- Unter Docker/Podman: Überprüfe, ob der Workspace eingebunden ist und dein Befehl keinen Zugriff außerhalb des Projektverzeichnisses benötigt.

**Fehlende Befehle**

- Container-Sandbox: Füge sie über `.qwen/sandbox.Dockerfile` oder `.qwen/sandbox.bashrc` hinzu.
- Seatbelt: Es werden die Binaries deines Hosts verwendet, die Sandbox kann jedoch den Zugriff auf bestimmte Pfade einschränken.

**Java nicht in der Docker-Sandbox verfügbar**

Das offizielle Qwen Code Docker-Image ist bewusst minimal gehalten, um es klein, sicher und schnell herunterladbar zu machen. Unterschiedliche Nutzer benötigen verschiedene Language-Runtimes (Java, Python, Node.js usw.), und das Bündeln aller Umgebungen in einem einzigen Image ist nicht praktikabel. Daher ist Java **standardmäßig nicht** in der Docker-Sandbox enthalten.

Wenn dein Workflow Java benötigt, kannst du das Base-Image erweitern, indem du eine `.qwen/sandbox.Dockerfile` in deinem Projekt erstellst:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Anschließend baust du das Sandbox-Image neu:

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
```

Weitere Details zur Anpassung der Sandbox findest du unter [Customizing the sandbox environment](/developers/tools/sandbox).

**Netzwerkprobleme**

- Überprüfe, ob das Sandbox-Profil Netzwerkzugriff erlaubt.
- Überprüfe die Proxy-Konfiguration.

### Debug-Modus

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Hinweis:** Wenn `DEBUG=true` in einer `.env`-Datei des Projekts steht, hat dies aufgrund des automatischen Ausschlusses keine Auswirkungen auf die CLI. Verwende `.qwen/.env`-Dateien für Qwen Code-spezifische Debug-Einstellungen.

### Sandbox inspizieren

```bash
# Check environment
qwen -s -p "run shell command: env | grep SANDBOX"

# List mounts
qwen -s -p "run shell command: mount | grep workspace"
```

## Sicherheitshinweise

- Sandboxing reduziert, aber beseitigt nicht alle Risiken.
- Verwende das restriktivste Profil, das deine Arbeit noch ermöglicht.
- Der Container-Overhead ist nach dem ersten Pull/Build minimal.
- GUI-Anwendungen funktionieren möglicherweise nicht in Sandboxes.

## Verwandte Dokumentation

- [Configuration](../configuration/settings): Vollständige Konfigurationsoptionen.
- [Commands](../features/commands): Verfügbare Befehle.
- [Troubleshooting](../support/troubleshooting): Allgemeine Fehlerbehebung.