# Qwen Code-Ausführung und -Bereitstellung

Dieses Dokument beschreibt, wie Qwen Code ausgeführt wird, und erklärt die Bereitstellungsarchitektur, die Qwen Code verwendet.

## Ausführen von Qwen Code

Es gibt mehrere Möglichkeiten, Qwen Code auszuführen. Die gewählte Option hängt davon ab, wie Sie es verwenden möchten.

---

### 1. Standardinstallation (Empfohlen für typische Benutzer)

Dies ist die empfohlene Methode für Endbenutzer, um Qwen Code zu installieren. Dabei wird das Qwen Code-Paket aus der NPM-Registry heruntergeladen.

- **Globale Installation:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Danach kann die CLI von überall aus ausgeführt werden:

  ```bash
  qwen
  ```

- **NPX-Ausführung:**

  ```bash
  # Führt die neueste Version von NPM aus, ohne eine globale Installation
  npx @qwen-code/qwen-code
  ```

---

### 2. Ausführen in einer Sandbox (Docker/Podman)

Aus Gründen der Sicherheit und Isolation kann Qwen Code innerhalb eines Containers ausgeführt werden. Dies ist die Standardmethode, wie die CLI Tools mit möglichen Nebenwirkungen ausführt.

- **Direkt aus der Registry:**
  Sie können das veröffentlichte Sandbox-Image direkt ausführen. Dies ist nützlich für Umgebungen, in denen nur Docker vorhanden ist und Sie die CLI ausführen möchten.
  ```bash
  # Das veröffentlichte Sandbox-Image ausführen
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Verwendung des `--sandbox`-Flags:**
  Wenn Sie Qwen Code lokal installiert haben (gemäß der oben beschriebenen Standardinstallation), können Sie es anweisen, innerhalb des Sandbox-Containers ausgeführt zu werden.
  ```bash
  qwen --sandbox -y -p "Ihr Prompt hier"
  ```

---

### 3. Ausführen aus dem Quellcode (Empfohlen für Qwen Code Mitwirkende)

Mitwirkende am Projekt möchten die CLI direkt aus dem Quellcode ausführen.

- **Entwicklungsmodus:**
  Diese Methode bietet Hot-Reloading und ist nützlich für die aktive Entwicklung.
  ```bash
  # Vom Stammverzeichnis des Repositories
  npm run start
  ```
- **Produktionsähnlicher Modus (Verknüpftes Paket):**
  Diese Methode simuliert eine globale Installation, indem Ihr lokales Paket verknüpft wird. Sie ist nützlich, um einen lokalen Build in einem Produktionsworkflow zu testen.

  ```bash
  # Verknüpfen Sie das lokale CLI-Paket mit Ihren globalen node_modules
  npm link packages/cli

  # Jetzt können Sie Ihre lokale Version mit dem Befehl `qwen` ausführen
  qwen
  ```

---

### 4. Ausführen des neuesten Qwen Code Commits von GitHub

Sie können die zuletzt committete Version von Qwen Code direkt aus dem GitHub-Repository ausführen. Dies ist nützlich, um Funktionen zu testen, die sich noch in der Entwicklung befinden.

```bash

# Führe die CLI direkt aus dem Hauptzweig auf GitHub aus
npx https://github.com/QwenLM/qwen-code
```

## Bereitstellungsarchitektur

Die oben beschriebenen Ausführungsmethoden werden durch die folgenden Architekturkomponenten und -prozesse ermöglicht:

**NPM-Pakete**

Das Qwen Code-Projekt ist ein Monorepo, das Kernpakete im NPM-Registry veröffentlicht:

- `@qwen-code/qwen-code-core`: Das Backend, das Logik und Toolausführung übernimmt.
- `@qwen-code/qwen-code`: Die benutzerseitige Oberfläche.

Diese Pakete werden bei der Standardinstallation sowie beim Ausführen von Qwen Code aus dem Quellcode verwendet.

**Build- und Packprozesse**

Es gibt zwei verschiedene Build-Prozesse, abhängig vom Verteilungskanal:

- **NPM-Veröffentlichung:** Für die Veröffentlichung im NPM-Registry wird der TypeScript-Quellcode in `@qwen-code/qwen-code-core` und `@qwen-code/qwen-code` mithilfe des TypeScript Compilers (`tsc`) in Standard-JavaScript transpiliert. Das resultierende `dist/`-Verzeichnis wird im NPM-Paket veröffentlicht. Dies ist ein gängiger Ansatz für TypeScript-Bibliotheken.

- **GitHub `npx`-Ausführung:** Beim direkten Ausführen der neuesten Version von Qwen Code von GitHub aus wird ein anderer Prozess durch das `prepare`-Skript in `package.json` ausgelöst. Dieses Skript verwendet `esbuild`, um die gesamte Anwendung und ihre Abhängigkeiten in eine einzelne, eigenständige JavaScript-Datei zu bündeln. Dieses Bundle wird dynamisch auf dem Rechner des Benutzers erstellt und nicht im Repository gespeichert.

**Docker-Sandbox-Image**

Die Docker-basierte Ausführungsmethode wird vom Container-Image `qwen-code-sandbox` unterstützt. Dieses Image wird in einer Container-Registry veröffentlicht und enthält eine vorinstallierte, globale Version von Qwen Code.

## Release-Prozess

Der Release-Prozess ist durch GitHub Actions automatisiert. Der Release-Workflow führt folgende Aktionen durch:

1.  Erstellen der NPM-Pakete mittels `tsc`.
2.  Veröffentlichen der NPM-Pakete in der Artifact Registry.
3.  Erstellen von GitHub-Releases mit gebündelten Assets.