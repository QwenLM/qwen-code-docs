# Sandbox

Dieses Dokument erklärt, wie Sie Qwen Code in einer Sandbox ausführen, um das Risiko zu verringern, wenn Tools Shell-Befehle ausführen oder Dateien ändern.

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