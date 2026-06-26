# Qwen Code – Ausführung und Bereitstellung

Dieses Dokument beschreibt, wie Qwen Code ausgeführt wird, und erläutert die Bereitstellungsarchitektur, die Qwen Code verwendet.

## Qwen Code ausführen

Es gibt mehrere Möglichkeiten, Qwen Code auszuführen. Welche Option Sie wählen, hängt davon ab, wie Sie Qwen Code nutzen möchten.

---

### 1. Standardinstallation (Empfohlen für typische Benutzer)

Dies ist die empfohlene Methode für Endbenutzer, um Qwen Code zu installieren. Dabei wird das Qwen Code-Paket aus der NPM-Registry heruntergeladen.

- **Globale Installation:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Anschließend kann die CLI von überall aus ausgeführt werden:

  ```bash
  qwen
  ```

- **Ausführung mit NPX:**

  ```bash
  # Führt die neueste Version aus NPM ohne globale Installation aus
  npx @qwen-code/qwen-code
  ```

---

### 2. Ausführung in einer Sandbox (Docker/Podman)

Aus Sicherheits- und Isolationsgründen kann Qwen Code in einem Container ausgeführt werden. Dies ist die Standardmethode, mit der die CLI Tools ausführt, die Nebenwirkungen haben könnten.

- **Direkt aus der Registry:**
  Sie können das veröffentlichte Sandbox-Image direkt ausführen. Dies ist nützlich für Umgebungen, in denen nur Docker verfügbar ist und Sie die CLI ausführen möchten.
  ```bash
  # Führt das veröffentlichte Sandbox-Image aus
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Verwendung des `--sandbox`-Flags:**
  Wenn Qwen Code lokal installiert ist (mit der oben beschriebenen Standardinstallation), können Sie es anweisen, innerhalb des Sandbox-Containers ausgeführt zu werden.
  ```bash
  qwen --sandbox -y -p "Ihr Prompt hier"
  ```

---

### 3. Ausführung aus dem Quellcode (Empfohlen für Qwen Code-Mitwirkende)

Mitwirkende am Projekt möchten die CLI direkt aus dem Quellcode ausführen.

- **Entwicklungsmodus:**
  Diese Methode bietet Hot-Reloading und ist für die aktive Entwicklung nützlich.
  ```bash
  # Vom Stammverzeichnis des Repositorys
  npm run start
  ```
- **Produktionsähnlicher Modus (Verknüpftes Paket):**
  Diese Methode simuliert eine globale Installation, indem sie Ihr lokales Paket verknüpft. Sie ist nützlich, um einen lokalen Build in einem Produktionsworkflow zu testen.

  ```bash
  # Verknüpft das lokale CLI-Paket mit Ihrem globalen node_modules
  npm link packages/cli

  # Jetzt können Sie Ihre lokale Version mit dem Befehl `qwen` ausführen
  qwen
  ```

---

### 4. Ausführung des neuesten Qwen Code-Commits von GitHub

Sie können die aktuellste committete Version von Qwen Code direkt aus dem GitHub-Repository ausführen. Dies ist nützlich, um Funktionen zu testen, die sich noch in der Entwicklung befinden.

```bash
# Führt die CLI direkt vom Main-Branch auf GitHub aus
npx https://github.com/QwenLM/qwen-code
```

## Bereitstellungsarchitektur

Die oben beschriebenen Ausführungsmethoden werden durch die folgenden Architekturkomponenten und -prozesse ermöglicht:

**NPM-Pakete**

Das Qwen Code-Projekt ist ein Monorepo, das Kernpakete in der NPM-Registry veröffentlicht:

- `@qwen-code/qwen-code-core`: Das Backend, das die Logik und Tool-Ausführung übernimmt.
- `@qwen-code/qwen-code`: Das benutzerseitige Frontend.

Diese Pakete werden bei der Standardinstallation und bei der Ausführung von Qwen Code aus dem Quellcode verwendet.

**Build- und Paketierungsprozesse**

Es gibt zwei unterschiedliche Build-Prozesse, je nach Vertriebskanal:

- **NPM-Veröffentlichung:** Für die Veröffentlichung in der NPM-Registry wird der TypeScript-Quellcode in `@qwen-code/qwen-code-core` und `@qwen-code/qwen-code` mit dem TypeScript Compiler (`tsc`) in standardmäßiges JavaScript transpiliert. Das resultierende `dist/`-Verzeichnis wird im NPM-Paket veröffentlicht. Dies ist ein Standardansatz für TypeScript-Bibliotheken.

- **GitHub-`npx`-Ausführung:** Wenn die neueste Version von Qwen Code direkt von GitHub ausgeführt wird, wird ein anderer Prozess durch das `prepare`-Skript in `package.json` ausgelöst. Dieses Skript verwendet `esbuild`, um die gesamte Anwendung und ihre Abhängigkeiten in eine einzige, eigenständige JavaScript-Datei zu bündeln. Dieses Bundle wird on-the-fly auf dem Rechner des Benutzers erstellt und nicht in das Repository eingecheckt.

**Docker-Sandbox-Image**

Die Docker-basierte Ausführungsmethode wird durch das Container-Image `qwen-code-sandbox` unterstützt. Dieses Image wird in einer Container-Registry veröffentlicht und enthält eine vorinstallierte, globale Version von Qwen Code.

## Veröffentlichungsprozess

Der Veröffentlichungsprozess ist durch GitHub Actions automatisiert. Der Release-Workflow führt die folgenden Aktionen aus:

1.  Erstellen der NPM-Pakete mit `tsc`.
2.  Veröffentlichen der NPM-Pakete in der Artefakt-Registry.
3.  Erstellen von GitHub-Releases mit gebündelten Assets.