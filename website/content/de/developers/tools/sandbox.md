## Anpassen der Sandbox-Umgebung (Docker/Podman)

### Derzeit unterstützt das Projekt die Verwendung der BUILD_SANDBOX-Funktion nach der Installation über das npm-Paket nicht

1. Um eine benutzerdefinierte Sandbox zu erstellen, müssen Sie auf die Build-Skripte (scripts/build_sandbox.js) im Quellcode-Repository zugreifen.
2. Diese Build-Skripte sind in den von npm veröffentlichten Paketen nicht enthalten.
3. Der Code enthält hartcodierte Pfadprüfungen, die Build-Anfragen aus Nicht-Quellcode-Umgebungen explizit ablehnen.

Wenn Sie zusätzliche Tools innerhalb des Containers benötigen (z.B. `git`, `python`, `rg`), erstellen Sie eine benutzerdefinierte Dockerfile. Die genaue Vorgehensweise ist wie folgt:

#### 1. Klonen Sie zunächst das qwen code Projekt unter https://github.com/QwenLM/qwen-code.git

#### 2. Stellen Sie sicher, dass Sie die folgenden Schritte im Verzeichnis des Quellcode-Repositories durchführen

```bash

# 1. Installieren Sie zunächst die Abhängigkeiten des Projekts
npm install

# 2. Bauen Sie das Qwen Code Projekt
npm run build
```

# 3. Überprüfen Sie, dass das dist-Verzeichnis generiert wurde
ls -la packages/cli/dist/

# 4. Erstellen Sie einen globalen Link im CLI-Paketverzeichnis
cd packages/cli
npm link

# 5. Verifizierung des Links (er sollte nun auf den Quellcode zeigen)
which qwen

# Erwartete Ausgabe: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen

# Oder ähnliche Pfade, aber es sollte ein symbolischer Link sein

# 6. Für Details zum symbolischen Link können Sie den genauen Pfad zum Quellcode anzeigen lassen
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# Es sollte anzeigen, dass dies ein symbolischer Link zu Ihrem Quellcode-Verzeichnis ist

# 7. Testen Sie die Version von qwen
qwen -v

# npm link wird das globale qwen überschreiben. Um Probleme durch gleiche Versionsnummern zu vermeiden, können Sie zunächst das globale CLI deinstallieren
```

#### 3. Erstellen Sie Ihre Sandbox-Dockerfile im Stammverzeichnis Ihres Projekts

- Pfad: `.qwen/sandbox.Dockerfile`

- Offizielle Spiegelbildadresse: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# Basierend auf dem offiziellen Qwen-Sandbox-Image (Es wird empfohlen, die Version explizit anzugeben)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# Fügen Sie hier Ihre zusätzlichen Tools hinzu
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. Erstellen Sie das erste Sandbox-Image im Stammverzeichnis Ihres Projekts

```bash
GEMINI_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# Überprüfen Sie, ob die von Ihnen gestartete Version des Tools mit der Version Ihres benutzerdefinierten Images übereinstimmt. Wenn sie übereinstimmen, war der Start erfolgreich
```

Dadurch wird ein projektspezifisches Image basierend auf dem Standard-Sandbox-Image erstellt.

#### npm-Link entfernen

- Wenn Sie die offizielle CLI von qwen wiederherstellen möchten, entfernen Sie bitte den npm-Link

```bash

# Methode 1: Global trennen
npm unlink -g @qwen-code/qwen-code

# Methode 2: Entfernen im Verzeichnis packages/cli
cd packages/cli
npm unlink

# Überprüfung wurde aufgehoben
which qwen

# Es sollte "qwen not found" anzeigen

# Installieren Sie die globale Version erneut, falls erforderlich
npm install -g @qwen-code/qwen-code

# Wiederherstellung der Überprüfung
which qwen
qwen --version
```