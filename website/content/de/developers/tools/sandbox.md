---
description: "Passe die Qwen Code Sandbox-Umgebung an. Erstelle sichere Docker- oder Podman-Container für isolierte KI-Codeausführung, Dateiänderungen und projektspezifische Tools."
---

# Anpassen der Sandbox-Umgebung (Docker/Podman)

## Derzeit unterstützt das Projekt die Verwendung der `BUILD_SANDBOX`-Funktion nicht, wenn die Installation über das npm-Paket erfolgte

1. Um eine benutzerdefinierte Sandbox zu erstellen, musst du auf die Build-Skripte (`scripts/build_sandbox.js`) im Quellcode-Repository zugreifen.
2. Diese Build-Skripte sind nicht in den über npm veröffentlichten Paketen enthalten.
3. Der Code enthält hartkodierte Pfadprüfungen, die Build-Anfragen aus Nicht-Quellcode-Umgebungen explizit ablehnen.

Wenn du zusätzliche Tools im Container benötigst (z. B. `git`, `python`, `rg`), erstelle ein benutzerdefiniertes Dockerfile. Die genaue Vorgehensweise ist wie folgt:

### 1. Klone zunächst das Qwen Code-Projekt: https://github.com/QwenLM/qwen-code.git

### 2. Stelle sicher, dass du die folgenden Schritte im Verzeichnis des Quellcode-Repositories ausführst

```bash
# 1. First, install the dependencies of the project
npm install

# 2. Build the Qwen Code project
npm run build

# 3. Verify that the dist directory has been generated
ls -la packages/cli/dist/

# 4. Create a global link in the CLI package directory
cd packages/cli
npm link

# 5. Verification link (it should now point to the source code)
which qwen
# Expected output: /xxx/xxx/.nvm/versions/node/v24.11.1/bin/qwen
# Or similar paths, but it should be a symbolic link

# 6. For details of the symbolic link, you can see the specific source code path
ls -la $(dirname $(which qwen))/../lib/node_modules/@qwen-code/qwen-code
# It should show that this is a symbolic link pointing to your source code directory

# 7.Test the version of qwen
qwen -v
# npm link will overwrite the global qwen. To avoid being unable to distinguish the same version number, you can uninstall the global CLI first

```

### 3. Erstelle dein Sandbox-Dockerfile im Stammverzeichnis deines eigenen Projekts

- Pfad: `.qwen/sandbox.Dockerfile`

- Offizielle Image-Adresse: https://github.com/QwenLM/qwen-code/pkgs/container/qwen-code

```bash
# Based on the official Qwen sandbox image (It is recommended to explicitly specify the version)
FROM ghcr.io/qwenlm/qwen-code:sha-570ec43
# Add your extra tools here
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    ripgrep
```

### 4. Erstelle das erste Sandbox-Image im Stammverzeichnis deines Projekts

```bash
QWEN_SANDBOX=docker BUILD_SANDBOX=1 qwen -s
# Observe whether the sandbox version of the tool you launched is consistent with the version of your custom image. If they are consistent, the startup will be successful
```

Dadurch wird ein projektspezifisches Image basierend auf dem Standard-Sandbox-Image erstellt.

### npm-Link entfernen

- Wenn du die offizielle Qwen CLI wiederherstellen möchtest, entferne bitte den npm-Link

```bash
# Method 1: Unlink globally
npm unlink -g @qwen-code/qwen-code

# Method 2: Remove it in the packages/cli directory
cd packages/cli
npm unlink

# Verification has been lifted
which qwen
# It should display "qwen not found"

# Reinstall the global version if necessary
npm install -g @qwen-code/qwen-code

# Verification Recovery
which qwen
qwen --version
```
