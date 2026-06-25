# Sandbox

Dieses Dokument erklärt, wie Qwen Code in einer Sandbox ausgeführt wird, um Risiken zu reduzieren, wenn Tools Shell-Befehle ausführen oder Dateien ändern.

## Voraussetzungen

Bevor Sie die Sandbox verwenden, müssen Sie Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

Um die Installation zu überprüfen

```bash
qwen --version
```

## Überblick über Sandboxing

Sandboxing isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von Ihrem Host-System und bietet eine Sicherheitsbarriere zwischen der CLI und Ihrer Umgebung.

Die Vorteile von Sandboxing sind:

- **Sicherheit**: Verhindert versehentliche Systemschäden oder Datenverlust.
- **Isolation**: Beschränkt den Dateisystemzugriff auf das Projektverzeichnis.
- **Konsistenz**: Stellt reproduzierbare Umgebungen auf verschiedenen Systemen sicher.
- **Schutz**: Reduziert Risiken bei der Arbeit mit nicht vertrauenswürdigem Code oder experimentellen Befehlen.

> [!note]
>
> **Hinweis zur Benennung:** Einige sandboxbezogene Umgebungsvariablen haben möglicherweise historisch das Präfix `GEMINI_*` verwendet. Alle neuen Umgebungsvariablen verwenden das Präfix `QWEN_*`.

## Methoden des Sandboxing

Die ideale Methode des Sandboxing kann je nach Plattform und bevorzugter Containerlösung variieren.

### 1. macOS Seatbelt (nur macOS)

Leichtgewichtiges, integriertes Sandboxing mit `sandbox-exec`.

**Standardprofil**: `permissive-open` – beschränkt Schreibzugriffe außerhalb des Projektverzeichnisses, erlaubt aber die meisten anderen Operationen und ausgehenden Netzwerkzugriff.

**Am besten geeignet für**: Schnell, kein Docker erforderlich, starke Absicherung für Dateischreibvorgänge.

### 2. Containerbasiert (Docker/Podman)

Plattformübergreifendes Sandboxing mit vollständiger Prozessisolierung.

Standardmäßig verwendet Qwen Code ein veröffentlichtes Sandbox-Image (konfiguriert im CLI-Paket) und zieht es bei Bedarf.

Der Container-Sandbox mountet Ihren Arbeitsbereich und Ihr `~/.qwen`-Verzeichnis in den Container, sodass Authentifizierung und Einstellungen zwischen den Ausführungen erhalten bleiben.

**Am besten geeignet für**: Starke Isolation auf jedem Betriebssystem, konsistente Werkzeuge in einem bekannten Image.

### Auswahl einer Methode

- **Auf macOS**:
  - Verwenden Sie Seatbelt, wenn Sie leichtgewichtiges Sandboxing wünschen (empfohlen für die meisten Benutzer).
  - Verwenden Sie Docker/Podman, wenn Sie eine vollständige Linux-Benutzerumgebung benötigen (z. B. Tools, die Linux-Binärdateien erfordern).
- **Auf Linux/Windows**:
  - Verwenden Sie Docker oder Podman.

## Schnellstart

```bash
# Sandboxing mit Befehlsflag aktivieren
qwen -s -p "analysiere die Codestruktur"

# Oder Sandboxing für die aktuelle Shell-Sitzung aktivieren (empfohlen für CI/Skripte)
export QWEN_SANDBOX=true   # true wählt automatisch einen Anbieter aus (siehe Hinweise unten)
qwen -p "führe die Testsuite aus"

# In settings.json konfigurieren
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **Hinweise zur Anbieterauswahl:**
>
> - Auf **macOS** wählt `QWEN_SANDBOX=true` normalerweise `sandbox-exec` (Seatbelt), falls verfügbar.
> - Auf **Linux/Windows** erfordert `QWEN_SANDBOX=true`, dass `docker` oder `podman` installiert ist.
> - Um einen Anbieter zu erzwingen, setzen Sie `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Konfiguration

### Sandboxing aktivieren (in der Reihenfolge der Priorität)

1. **Umgebungsvariable**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Befehlsflag / Argument**: `-s`, `--sandbox` oder `--sandbox=<provider>`
3. **Einstellungsdatei**: `tools.sandbox` in Ihrer `settings.json` (z. B. `{"tools": {"sandbox": true}}`).

> [!important]
>
> Wenn `QWEN_SANDBOX` gesetzt ist, **überschreibt** dies das CLI-Flag und `settings.json`.

### Sandbox-Image konfigurieren (Docker/Podman)

- **CLI-Flag**: `--sandbox-image <image>`
- **Umgebungsvariable**: `QWEN_SANDBOX_IMAGE=<image>`
- **Einstellungsdatei**: `tools.sandboxImage` in Ihrer `settings.json` (z. B. `{"tools": {"sandboxImage": "ghcr.io/qwenlm/qwen-code:0.14.1"}}`)

Prioritätsreihenfolge (höchste zu niedrigste):

1. `--sandbox-image`
2. `QWEN_SANDBOX_IMAGE`
3. `tools.sandboxImage`
4. Standard-Image aus dem CLI-Paket (z. B. `ghcr.io/qwenlm/qwen-code:<version>`)

`settings.env.QWEN_SANDBOX_IMAGE` funktioniert ebenfalls als generischer Mechanismus zum Injizieren von Umgebungsvariablen, aber `tools.sandboxImage` ist die bevorzugte dauerhafte Einstellung.

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
> Beginnen Sie mit `permissive-open` und verschärfen Sie auf `restrictive-closed`, wenn Ihr Workflow noch funktioniert.

### Benutzerdefinierte Seatbelt-Profile (macOS)

Um ein benutzerdefiniertes Seatbelt-Profil zu verwenden:

1. Erstellen Sie eine Datei mit dem Namen `.qwen/sandbox-macos-<profilname>.sb` in Ihrem Projekt.
2. Setzen Sie `SEATBELT_PROFILE=<profilname>`.

### Benutzerdefinierte Sandbox-Flags

Für containerbasiertes Sandboxing können Sie benutzerdefinierte Flags in den `docker`- oder `podman`-Befehl einfügen, indem Sie die Umgebungsvariable `SANDBOX_FLAGS` verwenden. Dies ist nützlich für erweiterte Konfigurationen, z. B. um Sicherheitsfunktionen für bestimmte Anwendungsfälle zu deaktivieren.

**Beispiel (Podman)**:

Um die SELinux-Kennzeichnung für Volume-Mounts zu deaktivieren, können Sie Folgendes setzen:
```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Mehrere Flags können als leerzeichengetrennter String angegeben werden:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Netzwerk-Proxy (alle Sandbox-Methoden)

Wenn Sie den ausgehenden Netzwerkzugriff auf eine Whitelist beschränken möchten, können Sie einen lokalen Proxy zusammen mit der Sandbox ausführen:

- Setzen Sie `QWEN_SANDBOX_PROXY_COMMAND=<command>`
- Der Befehl muss einen Proxy-Server starten, der auf `:::8877` lauscht

Dies ist besonders mit `*-proxied`-Seatbelt-Profilen nützlich.

Ein funktionierendes Beispiel für einen Whitelist-Proxy finden Sie unter: [Beispiel-Proxyskript](../../developers/examples/proxy-script.md).

## Linux-UID/GID-Handling

Unter Linux aktiviert Qwen Code standardmäßig die UID/GID-Zuordnung, sodass die Sandbox mit Ihrem Benutzer läuft (und das gemountete `~/.qwen` wiederverwendet). Überschreiben Sie dies mit:

```bash
export SANDBOX_SET_UID_GID=true   # Host-UID/GID erzwingen
export SANDBOX_SET_UID_GID=false  # UID/GID-Zuordnung deaktivieren
```

## Fehlerbehebung

### Häufige Probleme

**„Operation not permitted“**

- Der Vorgang erfordert Zugriff außerhalb der Sandbox.
- Unter macOS Seatbelt: Versuchen Sie ein permissiveres `SEATBELT_PROFILE`.
- Unter Docker/Podman: Überprüfen Sie, ob das Arbeitsverzeichnis gemountet ist und Ihr Befehl keinen Zugriff außerhalb des Projektverzeichnisses benötigt.

**Fehlende Befehle**

- Container-Sandbox: Fügen Sie sie über `.qwen/sandbox.Dockerfile` oder `.qwen/sandbox.bashrc` hinzu.
- Seatbelt: Ihre Host-Binärdateien werden verwendet, aber die Sandbox kann den Zugriff auf einige Pfade einschränken.

**Java nicht im Docker-Sandbox verfügbar**

Das offizielle Qwen Code-Docker-Image ist bewusst minimalistisch gehalten, um das Image klein, sicher und schnell pullbar zu halten. Verschiedene Benutzer benötigen unterschiedliche Laufzeitumgebungen (Java, Python, Node.js usw.) und es ist nicht praktikabel, alle Umgebungen in ein einzelnes Image zu packen. Daher ist Java standardmäßig **nicht** im Docker-Sandbox enthalten.

Wenn Ihr Workflow Java erfordert, können Sie das Basis-Image erweitern, indem Sie eine `.qwen/sandbox.Dockerfile` in Ihrem Projekt erstellen:

```dockerfile
FROM ghcr.io/qwenlm/qwen-code:latest

RUN apt-get update && \
    apt-get install -y openjdk-17-jre && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*
```

Erstellen Sie dann das Sandbox-Image neu:

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

**Hinweis:** Wenn Sie `DEBUG=true` in einer `.env`-Datei des Projekts haben, wirkt sich dies aufgrund der automatischen Ausnahme nicht auf die CLI aus. Verwenden Sie `.qwen/.env`-Dateien für Qwen-Code-spezifische Debug-Einstellungen.

### Sandbox inspizieren

```bash
# Umgebung prüfen
qwen -s -p "run shell command: env | grep SANDBOX"

# Mounts auflisten
qwen -s -p "run shell command: mount | grep workspace"
```

## Sicherheitshinweise

- Sandboxing reduziert Risiken, beseitigt sie aber nicht vollständig.
- Verwenden Sie das restriktivste Profil, das Ihre Arbeit erlaubt.
- Der Container-Overhead ist nach dem ersten Pull/Build minimal.
- GUI-Anwendungen funktionieren möglicherweise nicht in Sandboxes.

## Verwandte Dokumentation

- [Konfiguration](../configuration/settings): Vollständige Konfigurationsoptionen.
- [Befehle](../features/commands): Verfügbare Befehle.
- [Fehlerbehebung](../support/troubleshooting): Allgemeine Fehlerbehebung.
