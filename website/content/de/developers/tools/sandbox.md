## Anpassen der Sandbox-Umgebung (Docker/Podman)

### Derzeit unterstützt das Projekt die Verwendung der Funktion `BUILD_SANDBOX` nach der Installation über das npm-Paket nicht.

1. Um eine benutzerdefinierte Sandbox zu erstellen, müssen Sie auf die Build-Skripte (`scripts/build_sandbox.js`) im Quellcode-Repository zugreifen.  
2. Diese Build-Skripte sind nicht in den von npm veröffentlichten Paketen enthalten.  
3. Der Code enthält hartcodierte Pfadprüfungen, die Build-Anfragen aus Nicht-Quellcode-Umgebungen explizit ablehnen.

Falls Sie zusätzliche Tools innerhalb des Containers benötigen (z. B. `git`, `python`, `rg`), erstellen Sie eine benutzerdefinierte Dockerdatei. Die konkreten Schritte lauten wie folgt:

#### 1. Klonen Sie zunächst das Qwen-Code-Projekt: https://github.com/QwenLM/qwen-code.git

#### 2. Stellen Sie sicher, dass Sie die folgenden Schritte im Verzeichnis des Quellcode-Repositories ausführen:

```bash

# 1. Installieren Sie zunächst die Projektabhängigkeiten
npm install

# 2. Bauen Sie das Qwen Code-Projekt
npm run build

# 3. Überprüfen Sie, ob das Verzeichnis `dist` erstellt wurde
ls -la packages/cli/dist/

# 4. Erstellen Sie einen globalen Link im CLI-Paketverzeichnis
cd packages/cli
npm link

# 5. Überprüfen Sie den Link (er sollte nun auf den Quellcode verweisen)
which qwen

# Erwartete Ausgabe: `/xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen`

# Oder ein ähnlicher Pfad – es muss jedoch ein symbolischer Link sein

# 6. Für Details zum symbolischen Link können Sie den konkreten Pfad zum Quellcode anzeigen
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code

# Dort sollte angezeigt werden, dass es sich um einen symbolischen Link handelt, der auf Ihr Quellcodeverzeichnis verweist

# 7. Testen Sie die Version von `qwen`
qwen -v

# `npm link` überschreibt die globale `qwen`-Installation. Um Verwechslungen mit derselben Versionsnummer zu vermeiden, können Sie die globale CLI zuvor deinstallieren

#### 3. Erstellen Sie Ihre Sandbox-Dockerdatei im Stammverzeichnis Ihres eigenen Projekts

- Pfad: `.qwen/sandbox.Dockerfile`

- Offizielle Spiegel-Image-Adresse: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash

# Basierend auf dem offiziellen Qwen-Sandbox-Image (Es wird empfohlen, die Version explizit anzugeben.)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43

# Fügen Sie hier Ihre zusätzlichen Tools hinzu.
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

#### 4. Erstellen Sie das erste Sandbox-Image im Stammverzeichnis Ihres Projekts

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s

# Prüfen Sie, ob die Sandbox-Version des gestarteten Tools mit der Version Ihres benutzerdefinierten Images übereinstimmt. Bei Übereinstimmung ist der Start erfolgreich.
```

Dadurch wird ein projektspezifisches Image basierend auf dem standardmäßigen Sandbox-Image erstellt.

#### Entfernen Sie den npm-Link

- Wenn Sie die offizielle CLI von qwen wiederherstellen möchten, entfernen Sie bitte den npm-Link.

```bash

# Methode 1: Globalen Link entfernen
npm unlink -g @qwen-code/qwen-code

# Methode 2: Entfernen im Verzeichnis packages/cli
cd packages/cli
npm unlink

# Überprüfung, ob die Deinstallation erfolgreich war
which qwen

# Es sollte „qwen not found“ ausgegeben werden

# Neuinstallation der globalen Version (falls erforderlich)
npm install -g @qwen-code/qwen-code

# Überprüfung der Wiederherstellung
which qwen
qwen --version