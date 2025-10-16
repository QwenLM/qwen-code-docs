# Qwen Code Ausführung und Deployment

Dieses Dokument beschreibt, wie du Qwen Code ausführst und erklärt die Deployment-Architektur, die Qwen Code verwendet.

## Qwen Code ausführen

Es gibt mehrere Möglichkeiten, Qwen Code auszuführen. Die Option, die du wählst, hängt davon ab, wie du es verwenden willst.

---

### 1. Standardinstallation (Empfohlen für typische Benutzer)

Dies ist die empfohlene Methode für Endbenutzer, um Qwen Code zu installieren. Dabei wird das Qwen Code-Paket aus der NPM-Registry heruntergeladen.

- **Globale Installation:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Danach kannst du die CLI von überall ausführen:

  ```bash
  qwen
  ```

- **Mit NPX ausführen:**

  ```bash
  # Führt die neueste Version von NPM aus, ohne eine globale Installation
  npx @qwen-code/qwen-code
  ```

---

### 2. Ausführen in einer Sandbox (Docker/Podman)

Aus Gründen der Sicherheit und Isolation kann Qwen Code innerhalb eines Containers ausgeführt werden. Dies ist die Standardmethode, wie die CLI Tools mit möglichen Nebenwirkungen ausführt.

- **Direkt aus der Registry:**
  Du kannst das veröffentlichte Sandbox-Image direkt ausführen. Dies ist nützlich in Umgebungen, in denen du nur Docker zur Verfügung hast und die CLI ausführen möchtest.
  ```bash
  # Run the published sandbox image
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Verwendung des `--sandbox` Flags:**
  Wenn Qwen Code lokal installiert ist (gemäß der oben beschriebenen Standardinstallation), kannst du es anweisen, innerhalb des Sandbox-Containers ausgeführt zu werden.
  ```bash
  qwen --sandbox -y -p "your prompt here"
  ```

---

### 3. Ausführen aus dem Quellcode (Empfohlen für Qwen Code Mitwirkende)

Mitwirkende am Projekt möchten die CLI direkt aus dem Quellcode ausführen.

- **Entwicklungsmodus:**
  Diese Methode bietet Hot-Reloading und ist nützlich für die aktive Entwicklung.
  ```bash
  # Vom Root des Repositorys
  npm run start
  ```
- **Produktionsähnlicher Modus (Verknüpftes Package):**
  Diese Methode simuliert eine globale Installation, indem sie dein lokales Package verknüpft. Sie ist nützlich, um einen lokalen Build in einem Produktions-Workflow zu testen.

  ```bash
  # Verknüpfe das lokale CLI-Package mit deinen globalen node_modules
  npm link packages/cli

  # Jetzt kannst du deine lokale Version mit dem `qwen` Befehl ausführen
  qwen
  ```

---

### 4. Ausführen des neuesten Qwen Code Commits von GitHub

Du kannst die zuletzt committete Version von Qwen Code direkt aus dem GitHub-Repository ausführen. Das ist nützlich, um Features zu testen, die sich noch in Entwicklung befinden.

```bash

# CLI direkt aus dem main Branch auf GitHub ausführen
npx https://github.com/QwenLM/qwen-code
```

## Deployment-Architektur

Die oben beschriebenen Ausführungsmethoden werden durch die folgenden Architekturkomponenten und Prozesse ermöglicht:

**NPM-Pakete**

Das Qwen Code-Projekt ist ein Monorepo, das Kernpakete im NPM-Registry veröffentlicht:

- `@qwen-code/qwen-code-core`: Das Backend, welches Logik und Toolausführung übernimmt.
- `@qwen-code/qwen-code`: Das benutzerseitige Frontend.

Diese Pakete werden sowohl bei der Standardinstallation als auch beim Ausführen von Qwen Code aus dem Quellcode verwendet.

**Build- und Packaging-Prozesse**

Es gibt zwei verschiedene Build-Prozesse, abhängig vom Verteilungskanal:

- **NPM-Veröffentlichung:** Für die Veröffentlichung im NPM-Registry wird der TypeScript-Quellcode in `@qwen-code/qwen-code-core` und `@qwen-code/qwen-code` mithilfe des TypeScript Compilers (`tsc`) in Standard-JavaScript transpiliert. Das resultierende `dist/`-Verzeichnis wird dann im NPM-Paket veröffentlicht. Dies ist ein üblicher Ansatz für TypeScript-Bibliotheken.

- **GitHub `npx`-Ausführung:** Beim direkten Ausführen der neuesten Version von Qwen Code von GitHub aus wird ein anderer Prozess durch das `prepare`-Skript in der `package.json` gestartet. Dieses Skript nutzt `esbuild`, um die gesamte Anwendung samt Abhängigkeiten in eine einzelne, eigenständige JavaScript-Datei zu bündeln. Dieses Bundle wird dynamisch auf dem Rechner des Benutzers erzeugt und nicht im Repository versioniert.

**Docker-Sandbox-Image**

Die Docker-basierte Ausführungsmethode wird vom Container-Image `qwen-code-sandbox` unterstützt. Dieses Image wird in einer Container-Registry veröffentlicht und enthält eine vorinstallierte globale Version von Qwen Code.

## Release-Prozess

Der Release-Prozess ist durch GitHub Actions automatisiert. Der Release-Workflow führt folgende Aktionen durch:

1.  Build der NPM-Pakete mit `tsc`.
2.  Veröffentlichen der NPM-Pakete in der Artifact Registry.
3.  Erstellen von GitHub-Releases mit gebündelten Assets.