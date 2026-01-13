# Sandbox

Dieses Dokument erklärt, wie Qwen Code innerhalb einer Sandbox ausgeführt wird, um das Risiko zu verringern, wenn Tools Shell-Befehle ausführen oder Dateien ändern.

## Voraussetzungen

Bevor Sie die Sandboxing-Funktionalität nutzen können, müssen Sie Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

Zur Überprüfung der Installation

```bash
qwen --version
```

## Übersicht über die Sandbox

Sandboxing isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von Ihrem Host-System und bietet so eine Sicherheitsbarriere zwischen der Befehlszeilenschnittstelle und Ihrer Umgebung.

Die Vorteile des Sandboxings umfassen:

- **Sicherheit**: Verhindert versehentliche Systembeschädigung oder Datenverlust.
- **Isolation**: Beschränkt den Zugriff auf das Dateisystem auf das Projektverzeichnis.
- **Konsistenz**: Stellt reproduzierbare Umgebungen über verschiedene Systeme hinweg sicher.
- **Sicherheit**: Reduziert das Risiko beim Arbeiten mit nicht vertrauenswürdigen Code oder experimentellen Befehlen.

> [!note]
>
> **Hinweis zur Namensgebung:** Einige sandboxespezifische Umgebungsvariablen verwenden aus Gründen der Abwärtskompatibilität noch das Präfix `GEMINI_*`.

## Methoden zum Sandboxing

Ihre ideale Methode zum Sandboxing kann je nach Plattform und bevorzugter Containervorlösung unterschiedlich sein.

### 1. macOS Seatbelt (nur macOS)

Leichtgewichtige, integrierte Sandbox mithilfe von `sandbox-exec`.

**Standardprofil**: `permissive-open` – beschränkt Schreibzugriffe außerhalb des Projektverzeichnisses, erlaubt aber die meisten anderen Operationen und ausgehenden Netzwerkzugriff.

**Am besten geeignet für**: Schnelle Ausführung, kein Docker erforderlich, starke Absicherung für Datei-Schreibvorgänge.

### 2. Container-basiert (Docker/Podman)

Plattformübergreifende Sandbox mit vollständiger Prozesisolation.

Standardmäßig verwendet Qwen Code ein veröffentlichtes Sandbox-Image (in dem CLI-Paket konfiguriert) und lädt es bei Bedarf herunter.

Die Container-Sandbox bindet Ihren Arbeitsbereich und Ihr Verzeichnis `~/.qwen` in den Container ein, sodass Authentifizierung und Einstellungen zwischen den Läufen erhalten bleiben.

**Am besten geeignet für**: Starke Isolation auf jedem Betriebssystem, konsistente Tools innerhalb eines bekannten Images.

### Auswahl einer Methode

- **Unter macOS**:
  - Verwenden Sie Seatbelt, wenn Sie eine leichtgewichtige Sandbox benötigen (empfohlen für die meisten Benutzer).
  - Verwenden Sie Docker/Podman, wenn Sie eine vollständige Linux-Benutzerumgebung benötigen (z. B. Tools, die Linux-Binärdateien erfordern).
- **Unter Linux/Windows**:
  - Verwenden Sie Docker oder Podman.

## Schnellstart

```bash

# Aktivieren Sie die Sandbox mithilfe eines Befehlsflags
qwen -s -p "analysiere die Code-Struktur"

# Oder aktivieren Sie die Sandbox für Ihre Shell-Sitzung (empfohlen für CI/Scripte)
export GEMINI_SANDBOX=true   # true wählt automatisch einen Anbieter aus (siehe Hinweise unten)
qwen -p "führe die Testsuite aus"

# Konfigurieren Sie in settings.json
{
  "tools": {
    "sandbox": true
  }
}
```

> [!tip]
>
> **Hinweise zur Auswahl des Anbieters:**
>
> - Unter **macOS** wählt `GEMINI_SANDBOX=true` normalerweise `sandbox-exec` (Seatbelt) aus, falls verfügbar.
> - Unter **Linux/Windows** muss `docker` oder `podman` installiert sein, wenn `GEMINI_SANDBOX=true` verwendet wird.
> - Um einen bestimmten Anbieter zu erzwingen, setzen Sie `GEMINI_SANDBOX=docker|podman|sandbox-exec`.

## Konfiguration

### Aktivieren der Sandbox (in Reihenfolge der Priorität)

1. **Umgebungsvariable**: `GEMINI_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Befehlsflag / Argument**: `-s`, `--sandbox` oder `--sandbox=<Anbieter>`
3. **Einstellungsdatei**: `tools.sandbox` in Ihrer `settings.json` (z. B. `{"tools": {"sandbox": true}}`).

> [!important]
>
> Falls `GEMINI_SANDBOX` gesetzt ist, **überschreibt** dies das CLI-Flag und die `settings.json`.

### Konfigurieren des Sandbox-Images (Docker/Podman)

- **CLI-Flag**: `--sandbox-image <Image>`
- **Umgebungsvariable**: `GEMINI_SANDBOX_IMAGE=<Image>`

Falls Sie keines von beiden setzen, verwendet Qwen Code das Standard-Image, das im CLI-Paket konfiguriert ist (zum Beispiel `ghcr.io/qwenlm/qwen-code:<Version>`).

### macOS Seatbelt-Profile

Eingebaute Profile (festgelegt über die Umgebungsvariable `SEATBELT_PROFILE`):

- `permissive-open` (Standard): Schreibbeschränkungen, Netzwerk erlaubt
- `permissive-closed`: Schreibbeschränkungen, kein Netzwerk
- `permissive-proxied`: Schreibbeschränkungen, Netzwerk über Proxy
- `restrictive-open`: Strikte Beschränkungen, Netzwerk erlaubt
- `restrictive-closed`: Maximale Beschränkungen
- `restrictive-proxied`: Strikte Beschränkungen, Netzwerk über Proxy

> [!tip]
>
> Beginnen Sie mit `permissive-open` und wechseln Sie zu `restrictive-closed`, wenn Ihr Workflow weiterhin funktioniert.

### Benutzerdefinierte Seatbelt-Profile (macOS)

So verwenden Sie ein benutzerdefiniertes Seatbelt-Profil:

1. Erstellen Sie eine Datei mit dem Namen `.qwen/sandbox-macos-<profil_name>.sb` in Ihrem Projekt.
2. Setzen Sie `SEATBELT_PROFILE=<profil_name>`.

### Benutzerdefinierte Sandbox-Flags

Für containerbasiertes Sandboxing können Sie benutzerdefinierte Flags über die Umgebungsvariable `SANDBOX_FLAGS` in den Befehl `docker` oder `podman` einfügen. Dies ist nützlich für fortgeschrittene Konfigurationen, wie z.B. das Deaktivieren von Sicherheitsfunktionen für spezifische Anwendungsfälle.

**Beispiel (Podman)**:

Um die SELinux-Kennzeichnung für Volume-Mounts zu deaktivieren, können Sie Folgendes festlegen:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Mehrere Flags können als durch Leerzeichen getrennte Zeichenkette angegeben werden:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Netzwerk-Proxying (alle Sandbox-Methoden)

Wenn Sie den ausgehenden Netzwerkzugriff auf eine Positivliste beschränken möchten, können Sie einen lokalen Proxy neben der Sandbox ausführen:

- Setzen Sie `GEMINI_SANDBOX_PROXY_COMMAND=<Befehl>`
- Der Befehl muss einen Proxy-Server starten, der auf `:::8877` lauscht

Dies ist besonders nützlich mit `*-proxied` Seatbelt-Profilen.

Für ein funktionierendes Beispiel eines Proxy-Skripts im Positivlisten-Stil siehe: [Beispiel-Proxy-Skript](/developers/examples/proxy-script).

## Linux UID/GID-Handhabung

Unter Linux aktiviert Qwen Code standardmäßig die UID/GID-Zuordnung, sodass die Sandbox unter Ihrem Benutzer läuft (und das gemountete `~/.qwen` wiederverwendet). Überschreiben Sie dies mit:

```bash
export SANDBOX_SET_UID_GID=true   # Erzwinge Host UID/GID
export SANDBOX_SET_UID_GID=false  # Deaktiviere UID/GID-Zuordnung
```

## Problembehandlung

### Häufige Probleme

**"Operation not permitted"**

- Die Operation erfordert Zugriff außerhalb der Sandbox.
- Unter macOS Seatbelt: versuchen Sie ein weniger restriktives `SEATBELT_PROFILE`.
- Unter Docker/Podman: stellen Sie sicher, dass der Arbeitsbereich eingebunden ist und Ihr Befehl keinen Zugriff außerhalb des Projektverzeichnisses benötigt.

**Fehlende Befehle**

- Container-Sandbox: fügen Sie diese über `.qwen/sandbox.Dockerfile` oder `.qwen/sandbox.bashrc` hinzu.
- Seatbelt: Ihre Host-Binärdateien werden verwendet, aber die Sandbox könnte den Zugriff auf einige Pfade einschränken.

**Netzwerkprobleme**

- Stellen Sie sicher, dass das Sandbox-Profil Netzwerkzugriff erlaubt.
- Überprüfen Sie die Proxy-Konfiguration.

### Debug-Modus

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Hinweis:** Wenn Sie `DEBUG=true` in der `.env`-Datei eines Projekts haben, wirkt sich dies aufgrund der automatischen Ausschließung nicht auf die CLI aus. Verwenden Sie `.qwen/.env`-Dateien für Qwen Code-spezifische Debug-Einstellungen.

### Sandbox untersuchen

```bash

# Umgebung prüfen
qwen -s -p "run shell command: env | grep SANDBOX"

# Einhängepunkte auflisten
qwen -s -p "run shell command: mount | grep workspace"
```

## Sicherheitshinweise

- Sandboxing reduziert, eliminiert aber nicht alle Risiken.
- Verwenden Sie das restriktivste Profil, das Ihre Arbeit zulässt.
- Der Container-Overhead ist nach dem ersten Pullen/Erstellen minimal.
- GUI-Anwendungen funktionieren möglicherweise nicht in Sandboxes.

## Verwandte Dokumentation

- [Konfiguration](../configuration/settings): Vollständige Konfigurationsoptionen.
- [Befehle](../features/commands): Verfügbare Befehle.
- [Fehlerbehebung](../support/troubleshooting): Allgemeine Fehlerbehebung.