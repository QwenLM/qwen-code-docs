# Sandbox

Dieses Dokument erklärt, wie Qwen Code in einer Sandbox ausgeführt wird, um das Risiko zu reduzieren, wenn Tools Shell-Befehle ausführen oder Dateien ändern.

## Voraussetzungen

Bevor Sie die Sandbox-Funktionalität nutzen können, müssen Sie Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

Um die Installation zu überprüfen:

```bash
qwen --version
```

## Übersicht über Sandboxing

Sandboxing isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von Ihrem Host-System und bietet eine Sicherheitsbarriere zwischen der CLI und Ihrer Umgebung.

Die Vorteile von Sandboxing sind:

- **Sicherheit**: Verhindert versehentliche Systembeschädigungen oder Datenverluste.
- **Isolation**: Begrenzt den Dateisystemzugriff auf das Projektverzeichnis.
- **Konsistenz**: Stellt reproduzierbare Umgebungen auf verschiedenen Systemen sicher.
- **Sicherheit**: Reduziert das Risiko bei der Arbeit mit nicht vertrauenswürdigem Code oder experimentellen Befehlen.

> [!note]
>
> **Hinweis zur Benennung:** Einige sandbox-bezogene Umgebungsvariablen verwenden aus Gründen der Abwärtskompatibilität noch das Präfix `GEMINI_*`.

## Sandboxing-Methoden

Ihre ideale Methode für Sandboxing kann je nach Plattform und bevorzugter Containerlösung variieren.

### 1. macOS Seatbelt (nur macOS)

Leichtgewichtige, integrierte Sandbox mittels `sandbox-exec`.

**Standardprofil**: `permissive-open` – beschränkt Schreibzugriffe außerhalb des Projektverzeichnisses, erlaubt jedoch die meisten anderen Vorgänge und ausgehenden Netzwerkzugriff.

**Am besten geeignet für**: Schnelle Ausführung, kein Docker erforderlich, starke Beschränkungen beim Dateischreiben.

### 2. Container-basiert (Docker/Podman)

Plattformübergreifende Sandbox mit vollständiger Prozessisolation.

Standardmäßig verwendet Qwen Code ein veröffentlichtes Sandbox-Image (konfiguriert im CLI-Paket) und zieht es bei Bedarf herunter.

**Am besten geeignet für**: Starke Isolation auf jedem Betriebssystem, konsistente Werkzeuge innerhalb eines bekannten Images.

### Auswahl einer Methode

- **Unter macOS**:
  - Verwenden Sie Seatbelt, wenn Sie eine leichtgewichtige Sandbox wünschen (für die meisten Benutzer empfohlen).
  - Verwenden Sie Docker/Podman, wenn Sie eine vollständige Linux-Umgebung benötigen (z. B. Tools, die Linux-Binärdateien voraussetzen).
- **Unter Linux/Windows**:
  - Verwenden Sie Docker oder Podman.

## Schnellstart

```bash

# Sandboxing per Kommandozeilenflag aktivieren
qwen -s -p "analyze the code structure"

```markdown
# Oder aktiviere Sandboxing für deine Shell-Sitzung (empfohlen für CI / Skripte)
export GEMINI_SANDBOX=true   # true wählt automatisch einen Anbieter (siehe Hinweise unten)
qwen -p "run the test suite"

# Konfiguration in settings.json
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
> - Auf **macOS** wählt `GEMINI_SANDBOX=true` typischerweise `sandbox-exec` (Seatbelt), falls verfügbar.
> - Auf **Linux/Windows** benötigt `GEMINI_SANDBOX=true` installiertes `docker` oder `podman`.
> - Um einen Anbieter zu erzwingen, setze `GEMINI_SANDBOX=docker|podman|sandbox-exec`.

## Konfiguration

### Sandboxing aktivieren (nach Priorität geordnet)

1. **Umgebungsvariable**: `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Befehlsflag / Argument**: `-s`, `--sandbox`, oder `--sandbox=<provider>`
3. **Einstellungsdatei**: `tools.sandbox` in deiner `settings.json` (z.B. `{"tools": {"sandbox": true}}`).

> [!important]
>
> Falls `GEMINI_SANDBOX` gesetzt ist, **überschreibt** es das CLI-Flag und die `settings.json`.
```

### Sandbox-Image konfigurieren (Docker/Podman)

- **CLI-Flag**: `--sandbox-image <image>`
- **Umgebungsvariable**: `GEMINI_SANDBOX_IMAGE=<image>`

Wenn Sie keines der beiden festlegen, verwendet Qwen Code das im CLI-Paket konfigurierte Standard-Image (z. B. `ghcr.io/qwenlm/qwen-code:<version>`).

### macOS Seatbelt-Profile

Integrierte Profile (festgelegt über die Umgebungsvariable `SEATBELT_PROFILE`):

- `permissive-open` (Standard): Schreibbeschränkungen, Netzwerk erlaubt
- `permissive-closed`: Schreibbeschränkungen, kein Netzwerk
- `permissive-proxied`: Schreibbeschränkungen, Netzwerk über Proxy
- `restrictive-open`: Strenge Beschränkungen, Netzwerk erlaubt
- `restrictive-closed`: Maximale Beschränkungen
- `restrictive-proxied`: Strenge Beschränkungen, Netzwerk über Proxy

> [!tip]
>
> Beginnen Sie mit `permissive-open` und verschärfen Sie die Einstellungen dann zu `restrictive-closed`, wenn Ihr Workflow weiterhin funktioniert.

### Benutzerdefinierte Seatbelt-Profile (macOS)

Um ein benutzerdefiniertes Seatbelt-Profil zu verwenden:

1. Erstelle eine Datei mit dem Namen `.qwen/sandbox-macos-<profile_name>.sb` in deinem Projekt.
2. Setze `SEATBELT_PROFILE=<profile_name>`.

### Benutzerdefinierte Sandbox-Flags

Für containerbasiertes Sandboxing kannst du benutzerdefinierte Flags in den `docker`- oder `podman`-Befehl injizieren, indem du die Umgebungsvariable `SANDBOX_FLAGS` verwendest. Dies ist nützlich für erweiterte Konfigurationen, wie z. B. das Deaktivieren von Sicherheitsfunktionen für bestimmte Anwendungsfälle.

**Beispiel (Podman)**:

Um das SELinux-Labeling für Volume-Mounts zu deaktivieren, kannst du Folgendes setzen:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Mehrere Flags können als durch Leerzeichen getrennter String übergeben werden:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Netzwerk-Proxying (alle Sandbox-Methoden)

Wenn du den ausgehenden Netzwerkzugriff auf eine Allowlist beschränken möchtest, kannst du einen lokalen Proxy neben der Sandbox ausführen:

- Setze `GEMINI_SANDBOX_PROXY_COMMAND=<Befehl>`
- Der Befehl muss einen Proxy-Server starten, der auf `:::8877` lauscht

Dies ist besonders nützlich mit `*-proxied` Seatbelt-Profilen.

Ein funktionierendes Beispiel für einen Proxy im Allowlist-Stil findest du hier: [Beispielskript für Proxy](/developers/examples/proxy-script).

## Umgang mit Linux UID/GID

Die Sandbox verwaltet automatisch Benutzerberechtigungen unter Linux. Überschreibe diese Berechtigungen mit:

```bash
export SANDBOX_SET_UID_GID=true   # Erzwinge Host-UID/GID
export SANDBOX_SET_UID_GID=false  # Deaktiviere UID/GID-Zuordnung
```

## Anpassen der Sandbox-Umgebung (Docker/Podman)

Falls du zusätzliche Tools innerhalb des Containers benötigst (z. B. `git`, `python`, `rg`), erstelle eine eigene Dockerfile:

- Pfad: `.qwen/sandbox.Dockerfile`
- Dann ausführen mit: `BUILD_SANDBOX=1 qwen -s ...`

Dies erstellt ein projektspezifisches Image basierend auf dem Standard-Sandbox-Image.

## Fehlerbehebung

### Häufige Probleme

**„Operation not permitted“**

- Die Operation erfordert Zugriff außerhalb der Sandbox.
- Unter macOS Seatbelt: Versuche es mit einem weniger restriktiven `SEATBELT_PROFILE`.
- Unter Docker/Podman: Stelle sicher, dass der Arbeitsbereich gemountet ist und dein Befehl keinen Zugriff außerhalb des Projektverzeichnisses benötigt.

**Fehlende Befehle**

- Container-Sandbox: Füge sie über `.qwen/sandbox.Dockerfile` oder `.qwen/sandbox.bashrc` hinzu.
- Seatbelt: Deine Host-Binärdateien werden verwendet, aber die Sandbox könnte den Zugriff auf einige Pfade einschränken.

**Netzwerkprobleme**

- Überprüfe, ob das Sandbox-Profil Netzwerkzugriff erlaubt.
- Prüfe die Proxy-Konfiguration.

### Debug-Modus

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Hinweis:** Wenn du `DEBUG=true` in der `.env`-Datei eines Projekts hast, wirkt sich dies nicht auf die CLI aus, da es automatisch ausgeschlossen wird. Verwende `.qwen/.env`-Dateien für Qwen Code-spezifische Debug-Einstellungen.

### Sandbox untersuchen

```bash

# Umgebung prüfen
qwen -s -p "run shell command: env | grep SANDBOX"

# Mounts auflisten
qwen -s -p "run shell command: mount | grep workspace"
```

## Sicherheitshinweise

- Sandboxing reduziert, aber eliminiert nicht alle Risiken.
- Verwende das restriktivste Profil, das deine Arbeit zulässt.
- Der Container-Overhead ist nach dem ersten Pull/Build minimal.
- GUI-Anwendungen funktionieren möglicherweise nicht in Sandboxes.

## Zugehörige Dokumentation

- [Konfiguration](/users/configuration/settings): Alle Konfigurationsoptionen.
- [Befehle](/users/reference/cli-reference): Verfügbare Befehle.
- [Fehlerbehebung](/users/support/troubleshooting): Allgemeine Fehlerbehebung.