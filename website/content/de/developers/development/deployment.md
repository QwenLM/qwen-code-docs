# Ausführung und Deployment von Qwen Code

Dieses Dokument beschreibt, wie Qwen Code ausgeführt wird, und erläutert die von Qwen Code verwendete Deployment-Architektur.

## Qwen Code ausführen

Es gibt mehrere Möglichkeiten, Qwen Code auszuführen. Die gewählte Option hängt von deinem Anwendungsfall ab.

---

### 1. Standardinstallation (Empfohlen für typische Nutzer)

Dies ist die empfohlene Methode für Endnutzer, um Qwen Code zu installieren. Dabei wird das Qwen-Code-Paket aus der NPM-Registry heruntergeladen.

- **Globale Installation:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Anschließend kannst du die CLI von überall aus ausführen:

  ```bash
  qwen
  ```

- **Ausführung über NPX:**

  ```bash
  # Führt die neueste Version aus NPM ohne globale Installation aus
  npx @qwen-code/qwen-code
  ```

---

### 2. Ausführung in einer Sandbox (Docker/Podman)

Aus Sicherheits- und Isolationsgründen kann Qwen Code in einem Container ausgeführt werden. Dies ist die Standardmethode, mit der die CLI Tools ausführt, die Nebenwirkungen haben könnten.

- **Direkt aus der Registry:**
  Du kannst das veröffentlichte Sandbox-Image direkt ausführen. Dies ist nützlich für Umgebungen, in denen nur Docker verfügbar ist und du die CLI ausführen möchtest.
  ```bash
  # Führt das veröffentlichte Sandbox-Image aus
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Verwendung des `--sandbox`-Flags:**
  Wenn Qwen Code lokal installiert ist (mithilfe der oben beschriebenen Standardinstallation), kannst du anweisen, es innerhalb des Sandbox-Containers auszuführen.
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. Ausführung aus dem Quellcode (Empfohlen für Qwen-Code-Contributors)

Contributors des Projekts führen die CLI in der Regel direkt aus dem Quellcode aus.

- **Entwicklungsmodus:**
  Diese Methode bietet Hot-Reloading und ist nützlich für die aktive Entwicklung.
  ```bash
  # Vom Root-Verzeichnis des Repositories aus
  npm run start
  ```
- **Produktionsähnlicher Modus (Verlinktes Paket):**
  Diese Methode simuliert eine globale Installation, indem dein lokales Paket verlinkt wird. Sie ist nützlich, um einen lokalen Build in einem Produktions-Workflow zu testen.

  ```bash
  # Verlinkt das lokale CLI-Paket mit deinen globalen node_modules
  npm link packages/cli

  # Jetzt kannst du deine lokale Version mit dem `qwen`-Befehl ausführen
  qwen
  ```

---

### 4. Ausführung des neuesten Qwen-Code-Commits von GitHub

Du kannst die zuletzt committete Version von Qwen Code direkt aus dem GitHub-Repository ausführen. Dies ist nützlich, um Features zu testen, die sich noch in der Entwicklung befinden.

```bash
# Führt die CLI direkt aus dem main-Branch auf GitHub aus
npx https://github.com/QwenLM/qwen-code
```

## Deployment-Architektur

Die oben beschriebenen Ausführungsmethoden werden durch die folgenden Architekturkomponenten und Prozesse ermöglicht:

**NPM-Pakete**

Das Qwen-Code-Projekt ist ein Monorepo, das Core-Pakete in der NPM-Registry veröffentlicht:

- `@qwen-code/qwen-code-core`: Das Backend, das für die Logik und Tool-Ausführung zuständig ist.
- `@qwen-code/qwen-code`: Das nutzerorientierte Frontend.

Diese Pakete werden bei der Standardinstallation und bei der Ausführung von Qwen Code aus dem Quellcode verwendet.

**Build- und Packaging-Prozesse**

Je nach Distributionskanal kommen zwei unterschiedliche Build-Prozesse zum Einsatz:

- **NPM-Veröffentlichung:** Für die Veröffentlichung in der NPM-Registry wird der TypeScript-Quellcode in `@qwen-code/qwen-code-core` und `@qwen-code/qwen-code` mit dem TypeScript-Compiler (`tsc`) in standardmäßiges JavaScript transpiliert. Das resultierende `dist/`-Verzeichnis wird im NPM-Paket veröffentlicht. Dies ist ein Standardansatz für TypeScript-Bibliotheken.

- **GitHub-`npx`-Ausführung:** Bei der Ausführung der neuesten Version von Qwen Code direkt von GitHub wird ein anderer Prozess durch das `prepare`-Skript in `package.json` ausgelöst. Dieses Skript verwendet `esbuild`, um die gesamte Anwendung und ihre Abhängigkeiten in eine einzelne, eigenständige JavaScript-Datei zu bündeln. Dieses Bundle wird on-the-fly auf dem Rechner des Nutzers erstellt und nicht im Repository eingecheckt.

**Docker-Sandbox-Image**

Die Docker-basierte Ausführungsmethode wird durch das `qwen-code-sandbox`-Container-Image unterstützt. Dieses Image wird in einer Container-Registry veröffentlicht und enthält eine vorinstallierte, globale Version von Qwen Code.

## Release-Prozess

Der Release-Prozess wird über GitHub Actions automatisiert. Der Release-Workflow führt die folgenden Aktionen aus:

1.  Build der NPM-Pakete mit `tsc`.
2.  Veröffentlichung der NPM-Pakete in der Artifact-Registry.
3.  Erstellung von GitHub-Releases mit gebündelten Assets.