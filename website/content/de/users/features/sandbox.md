# Sandbox

Dieses Dokument erklärt, wie Sie Qwen Code in einer Sandbox ausführen, um Risiken zu verringern, wenn Tools Shell-Befehle ausführen oder Dateien ändern.

## Voraussetzungen

Bevor Sie die Sandbox-Funktion nutzen können, müssen Sie Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

Um die Installation zu überprüfen, führen Sie folgenden Befehl aus:

```bash
qwen --version
```

## Übersicht über die Sandbox-Funktion

Die Sandbox-Funktion isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von Ihrem Hostsystem und stellt so eine Sicherheitsbarriere zwischen der CLI und Ihrer Umgebung dar.

Die Vorteile der Sandbox-Funktion umfassen:

- **Sicherheit**: Vermeidung versehentlicher Systembeschädigung oder Datenverluste.
- **Isolation**: Beschränkung des Dateisystemzugriffs auf das Projektverzeichnis.
- **Konsistenz**: Gewährleistung reproduzierbarer Umgebungen auf unterschiedlichen Systemen.
- **Sicherheit**: Verringerung des Risikos beim Arbeiten mit nicht vertrauenswürdigem Code oder experimentellen Befehlen.

> [!note]
>
> **Namenshinweis:** Einige sandboxbezogene Umgebungsvariablen verwendeten historisch gesehen das Präfix `GEMINI_*`. Alle neuen Umgebungsvariablen verwenden das Präfix `QWEN_*`.

## Sandbox-Methoden

Ihre ideale Sandbox-Methode kann je nach Plattform und bevorzugter Container-Lösung variieren.

### 1. macOS Seatbelt (nur unter macOS)

Leichtgewichtige, integrierte Sandbox mit `sandbox-exec`.

**Standardprofil**: `permissive-open` – beschränkt Schreibzugriffe außerhalb des Projektverzeichnisses, erlaubt jedoch die meisten anderen Operationen sowie ausgehenden Netzwerkzugriff.

**Am besten geeignet für**: Schnelle Ausführung ohne Docker; starke Sicherheitsvorkehrungen für Dateischreibzugriffe.

### 2. Container-basiert (Docker/Podman)

Plattformübergreifende Sandbox mit vollständiger Prozesisolation.

Standardmäßig verwendet Qwen Code ein veröffentlichtes Sandbox-Image (konfiguriert im CLI-Paket) und lädt es bei Bedarf herunter.

Die Container-Sandbox bindet Ihr Arbeitsverzeichnis sowie Ihr Verzeichnis `~/.qwen` in den Container ein, sodass Authentifizierungsdaten und Einstellungen zwischen den Ausführungen erhalten bleiben.

**Am besten geeignet für**: Starke Isolation unter jedem Betriebssystem; konsistente Tools innerhalb eines bekannten Images.

### Auswahl einer Methode

- **Unter macOS**:
  - Verwenden Sie Seatbelt, wenn Sie eine leichtgewichtige Sandbox-Umgebung benötigen (empfohlen für die meisten Benutzer).
  - Verwenden Sie Docker/Podman, wenn Sie eine vollständige Linux-Benutzerland-Umgebung benötigen (z. B. Tools, die Linux-Binärdateien erfordern).
- **Unter Linux/Windows**:
  - Verwenden Sie Docker oder Podman.

## Schnellstart

```bash

# Sandbox-Umgebung über Befehlszeilenflag aktivieren
qwen -s -p "analysiere die Code-Struktur"

# Oder Sandbox-Umgebung für Ihre Shell-Sitzung aktivieren (empfohlen für CI / Skripte)
export QWEN_SANDBOX=true   # „true“ wählt automatisch einen Anbieter aus (siehe Hinweise unten)
qwen -p "führe die Test-Suite aus"

# In settings.json konfigurieren
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
> - Unter **macOS** wählt `QWEN_SANDBOX=true` in der Regel `sandbox-exec` (Seatbelt) aus, sofern verfügbar.
> - Unter **Linux/Windows** erfordert `QWEN_SANDBOX=true`, dass `docker` oder `podman` installiert ist.
> - Um einen bestimmten Anbieter zu erzwingen, setzen Sie `QWEN_SANDBOX=docker|podman|sandbox-exec`.

## Konfiguration

### Sandbox aktivieren (in Reihenfolge der Priorität)

1. **Umgebungsvariable**: `QWEN_SANDBOX=true|false|docker|podman|sandbox-exec`
2. **Befehlszeilenflag / Argument**: `-s`, `--sandbox` oder `--sandbox=<Anbieter>`
3. **Einstellungsdatei**: `tools.sandbox` in Ihrer `settings.json` (z. B. `{"tools": {"sandbox": true}}`).

> [!important]
>
> Falls `QWEN_SANDBOX` gesetzt ist, **überschreibt** dies das CLI-Flag und die `settings.json`.

### Sandbox-Image konfigurieren (Docker/Podman)

- **CLI-Flag**: `--sandbox-image <Image>`
- **Umgebungsvariable**: `QWEN_SANDBOX_IMAGE=<Image>`

Falls keines der beiden gesetzt ist, verwendet Qwen Code das standardmäßig im CLI-Paket konfigurierte Image (z. B. `ghcr.io/qwenlm/qwen-code:<Version>`).

### macOS-Seatbelt-Profile

Integrierte Profile (festgelegt über die Umgebungsvariable `SEATBELT_PROFILE`):

- `permissive-open` (Standard): Schreibbeschränkungen, Netzwerkzugriff erlaubt  
- `permissive-closed`: Schreibbeschränkungen, kein Netzwerkzugriff  
- `permissive-proxied`: Schreibbeschränkungen, Netzwerkzugriff nur über Proxy  
- `restrictive-open`: Strenge Beschränkungen, Netzwerkzugriff erlaubt  
- `restrictive-closed`: Maximale Beschränkungen  
- `restrictive-proxied`: Strenge Beschränkungen, Netzwerkzugriff nur über Proxy  

> [!tip]  
>  
> Beginnen Sie mit `permissive-open` und verschärfen Sie schrittweise auf `restrictive-closed`, sofern Ihr Workflow weiterhin funktioniert.

### Benutzerdefinierte Seatbelt-Profile (macOS)

So verwenden Sie ein benutzerdefiniertes Seatbelt-Profile:

1. Erstellen Sie eine Datei mit dem Namen `.qwen/sandbox-macos-<profile_name>.sb` in Ihrem Projekt.  
2. Legen Sie `SEATBELT_PROFILE=<profile_name>` fest.

### Benutzerdefinierte Sandbox-Flags

Bei containerbasierter Sandbox-Umgebung können Sie mithilfe der Umgebungsvariablen `SANDBOX_FLAGS` benutzerdefinierte Flags in den `docker`- oder `podman`-Befehl einfügen. Dies ist nützlich für erweiterte Konfigurationen, beispielsweise zum Deaktivieren von Sicherheitsfunktionen für bestimmte Anwendungsfälle.

**Beispiel (Podman)**:

Um die SELinux-Beschriftung für Volume-Mounts zu deaktivieren, können Sie Folgendes festlegen:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Mehrere Flags können als Leerzeichen-getrennte Zeichenkette angegeben werden:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

### Netzwerk-Proxying (alle Sandbox-Methoden)

Falls Sie den ausgehenden Netzwerkzugriff auf eine zulässige Liste (Allowlist) beschränken möchten, können Sie einen lokalen Proxy parallel zur Sandbox ausführen:

- Legen Sie `QWEN_SANDBOX_PROXY_COMMAND=<Befehl>` fest.
- Der Befehl muss einen Proxy-Server starten, der auf `:::8877` lauscht.

Dies ist insbesondere bei `*-proxied`-Seatbelt-Profilen nützlich.

Ein funktionierendes Beispiel für einen Proxy mit Allowlist-Stil finden Sie unter: [Beispiel-Proxy-Skript](/developers/examples/proxy-script).

## Linux-UID/GID-Verwaltung

Unter Linux aktiviert Qwen Code standardmäßig die UID/GID-Zuordnung, sodass die Sandbox als Ihr Benutzer ausgeführt wird (und das eingebundene Verzeichnis `~/.qwen` wiederverwendet). Überschreiben Sie dies mit:

```bash
export SANDBOX_SET_UID_GID=true   # Erzwingt die UID/GID des Hosts
export SANDBOX_SET_UID_GID=false  # Deaktiviert die UID/GID-Zuordnung
```

## Problembehandlung

### Häufige Probleme

**„Operation nicht zulässig“**

- Die Operation erfordert Zugriff außerhalb der Sandbox.
- Unter macOS Seatbelt: Versuchen Sie ein weniger restriktives `SEATBELT_PROFILE`.
- Unter Docker/Podman: Stellen Sie sicher, dass der Arbeitsbereich eingebunden ist und Ihr Befehl keinen Zugriff außerhalb des Projektverzeichnisses benötigt.

**Fehlende Befehle**

- Container-Sandbox: Fügen Sie sie über `.qwen/sandbox.Dockerfile` oder `.qwen/sandbox.bashrc` hinzu.
- Seatbelt: Ihre Host-Binärdateien werden verwendet, doch die Sandbox kann den Zugriff auf bestimmte Pfade einschränken.

**Java ist in der Docker-Sandbox nicht verfügbar**

Das offizielle Qwen Code Docker-Image ist absichtlich minimal gehalten, um das Image klein, sicher und schnell herunterladbar zu halten. Unterschiedliche Nutzer benötigen unterschiedliche Laufzeitumgebungen (Java, Python, Node.js usw.), weshalb es nicht praktikabel ist, alle Umgebungen in einem einzigen Image zu bündeln. Daher ist Java **standardmäßig nicht in der Docker-Sandbox enthalten**.

Falls Ihr Workflow Java erfordert, können Sie das Basis-Image durch Erstellen einer Datei `.qwen/sandbox.Dockerfile` in Ihrem Projekt erweitern:

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

Weitere Informationen zur Anpassung der Sandbox finden Sie unter [Anpassen der Sandbox-Umgebung](/developers/tools/sandbox).

**Netzwerkprobleme**

- Prüfen Sie, ob das Sandbox-Profil Netzwerkzugriff zulässt.
- Überprüfen Sie die Proxy-Konfiguration.

### Debug-Modus

```bash
DEBUG=1 qwen -s -p "Debug-Befehl"
```

**Hinweis:** Falls `DEBUG=true` in der `.env`-Datei eines Projekts gesetzt ist, hat dies aufgrund der automatischen Ausschlussregel keine Auswirkung auf die CLI. Verwenden Sie stattdessen `.qwen/.env`-Dateien für Qwen-Code-spezifische Debug-Einstellungen.

### Sandbox überprüfen

```bash

# Umgebung prüfen
qwen -s -p "Shell-Befehl ausführen: env | grep SANDBOX"

# Mounts auflisten
qwen -s -p "Shell-Befehl ausführen: mount | grep workspace"
```

## Sicherheitshinweise

- Sandboxing verringert Risiken, beseitigt sie jedoch nicht vollständig.
- Verwenden Sie das restriktivste Profil, das Ihre Arbeit noch zulässt.
- Der Container-Overhead ist nach dem ersten Pull oder Build minimal.
- GUI-Anwendungen funktionieren möglicherweise nicht in Sandboxes.

## Verwandte Dokumentation

- [Konfiguration](../configuration/settings): Alle verfügbaren Konfigurationsoptionen.
- [Befehle](../features/commands): Verfügbare Befehle.
- [Problembehandlung](../support/troubleshooting): Allgemeine Problembehandlung.