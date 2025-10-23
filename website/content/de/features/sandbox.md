# Sandboxing in Qwen Code

Dieses Dokument bietet eine Anleitung zum Sandboxing in Qwen Code, einschließlich Voraussetzungen, Quickstart und Konfiguration.

## Voraussetzungen

Bevor du Sandboxing verwenden kannst, musst du Qwen Code installieren und einrichten:

```bash
npm install -g @qwen-code/qwen-code
```

Um die Installation zu überprüfen:

```bash
qwen --version
```

## Übersicht über Sandboxing

Sandboxing isoliert potenziell gefährliche Operationen (wie Shell-Befehle oder Dateiänderungen) von deinem Host-System und stellt eine Sicherheitsbarriere zwischen KI-Operationen und deiner Umgebung bereit.

Die Vorteile von Sandboxing sind:

- **Security**: Verhindert versehentliche Systembeschädigungen oder Datenverluste.
- **Isolation**: Begrenzt den Dateisystemzugriff auf das Projektverzeichnis.
- **Consistency**: Stellt reproduzierbare Umgebungen auf verschiedenen Systemen sicher.
- **Safety**: Reduziert das Risiko bei der Arbeit mit nicht vertrauenswürdigem Code oder experimentellen Befehlen.

## Sandboxing-Methoden

Deine ideale Methode zum Sandboxing kann je nach Plattform und deiner bevorzugten Container-Lösung variieren.

### 1. macOS Seatbelt (nur macOS)

Leichtgewichtiges, integriertes Sandboxing mithilfe von `sandbox-exec`.

**Standardprofil**: `permissive-open` – beschränkt Schreibzugriffe außerhalb des Projektverzeichnisses, erlaubt jedoch die meisten anderen Operationen.

### 2. Container-basiert (Docker/Podman)

Plattformübergreifendes Sandboxing mit vollständiger Prozessisolation.

**Hinweis**: Erfordert das lokale Bauen des Sandbox-Images oder die Verwendung eines veröffentlichten Images aus der Registry deiner Organisation.

## Schnellstart

```bash

# Sandboxing per Kommandozeilen-Flag aktivieren
qwen -s -p "analyze the code structure"

# Umgebungsvariable verwenden
export GEMINI_SANDBOX=true
qwen -p "run the test suite"

# In settings.json konfigurieren
{
  "tools": {
    "sandbox": "docker"
  }
}
```

## Konfiguration

### Sandbox aktivieren (in Reihenfolge der Priorität)

1. **Command-Flag**: `-s` oder `--sandbox`
2. **Environment-Variable**: `GEMINI_SANDBOX=true|docker|podman|sandbox-exec`
3. **Settings-Datei**: `"sandbox": true` im `tools`-Objekt deiner `settings.json`-Datei (z.B. `{"tools": {"sandbox": true}}`).

### macOS Seatbelt-Profile

Built-in Profile (werden über die `SEATBELT_PROFILE` Env-Var gesetzt):

- `permissive-open` (Standard): Schreibbeschränkungen, Netzwerk erlaubt
- `permissive-closed`: Schreibbeschränkungen, kein Netzwerk
- `permissive-proxied`: Schreibbeschränkungen, Netzwerk über Proxy
- `restrictive-open`: Strenge Beschränkungen, Netzwerk erlaubt
- `restrictive-closed`: Maximale Beschränkungen

### Custom Sandbox Flags

Für containerbasiertes Sandboxing kannst du benutzerdefinierte Flags in den `docker` oder `podman` Befehl injizieren, indem du die `SANDBOX_FLAGS` Umgebungsvariable verwendest. Dies ist nützlich für fortgeschrittene Konfigurationen, wie z. B. das Deaktivieren von Sicherheitsfunktionen für bestimmte Anwendungsfälle.

**Beispiel (Podman)**:

Um das SELinux-Labeling für Volume-Mounts zu deaktivieren, kannst du folgendes setzen:

```bash
export SANDBOX_FLAGS="--security-opt label=disable"
```

Mehrere Flags können als durch Leerzeichen getrennter String angegeben werden:

```bash
export SANDBOX_FLAGS="--flag1 --flag2=value"
```

## Linux UID/GID Handling

Der Sandbox behandelt automatisch Benutzerberechtigungen unter Linux. Überschreibe diese Berechtigungen mit:

```bash
export SANDBOX_SET_UID_GID=true   # Host UID/GID erzwingen
export SANDBOX_SET_UID_GID=false  # UID/GID-Mapping deaktivieren
```

## Fehlerbehebung

### Häufige Probleme

**"Operation not permitted"**

- Die Operation benötigt Zugriff außerhalb der Sandbox.
- Versuche es mit einem weniger restriktiven Profil oder füge Mount-Punkte hinzu.

**Fehlende Befehle**

- Füge sie deiner benutzerdefinierten Dockerfile hinzu.
- Installiere sie über `sandbox.bashrc`.

**Netzwerkprobleme**

- Prüfe, ob das Sandbox-Profil Netzwerkzugriff erlaubt.
- Überprüfe die Proxy-Konfiguration.

### Debug-Modus

```bash
DEBUG=1 qwen -s -p "debug command"
```

**Hinweis:** Wenn du `DEBUG=true` in der `.env`-Datei eines Projekts hast, wirkt sich das nicht auf die CLI aus, da diese automatisch ausgeschlossen wird. Verwende `.qwen/.env`-Dateien für Qwen Code-spezifische Debug-Einstellungen.

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
- Der Container-Overhead ist nach dem ersten Build minimal.
- GUI-Anwendungen funktionieren möglicherweise nicht in Sandboxes.

## Verwandte Dokumentation

- [Configuration](./cli/configuration.md): Alle Konfigurationsoptionen.
- [Commands](./cli/commands.md): Verfügbare Befehle.
- [Troubleshooting](./troubleshooting.md): Allgemeine Fehlerbehebung.