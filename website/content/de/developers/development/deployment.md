# Qwen Code – Ausführung und Bereitstellung

Dieses Dokument beschreibt, wie Qwen Code ausgeführt wird, und erläutert die Bereitstellungsarchitektur, die Qwen Code verwendet.

## Qwen Code ausführen

Es gibt mehrere Möglichkeiten, Qwen Code auszuführen. Welche Option Sie wählen, hängt davon ab, wie Sie Qwen Code verwenden möchten.

---

### 1. Standardinstallation (Empfohlen für typische Nutzer)

Dies ist die empfohlene Installationsmethode für Endnutzer. Sie umfasst das Herunterladen des Qwen-Code-Pakets aus dem NPM-Registry.

- **Globale Installation:**

  ```bash
  npm install -g @qwen-code/qwen-code
  ```

  Anschließend können Sie die CLI von überall aus ausführen:

  ```bash
  qwen
  ```

- **Ausführung mit NPX:**

  ```bash
  # Führen Sie die neueste Version direkt von NPM ohne globale Installation aus
  npx @qwen-code/qwen-code
  ```

### 2. Ausführung in einer Sandbox (Docker/Podman)

Aus Sicherheits- und Isolationsgründen kann Qwen Code innerhalb eines Containers ausgeführt werden. Dies ist die Standardmethode, mit der die CLI Tools ausführt, die Nebeneffekte haben könnten.

- **Direkt aus der Registry:**
  Sie können das veröffentlichte Sandbox-Image direkt ausführen. Dies ist nützlich in Umgebungen, in denen nur Docker verfügbar ist und die CLI ausgeführt werden soll.
  ```bash
  # Das veröffentlichte Sandbox-Image ausführen
  docker run --rm -it ghcr.io/qwenlm/qwen-code:0.0.11
  ```
- **Mit dem Flag `--sandbox`:**
  Falls Qwen Code lokal installiert ist (mithilfe der oben beschriebenen Standardinstallation), können Sie es anweisen, innerhalb des Sandbox-Containers zu laufen.
  ```bash
  qwen --sandbox -y -p "Ihr Prompt hier"
  ```

### 3. Aus dem Quellcode ausführen (Empfohlen für Qwen Code-Mitwirkende)

Mitwirkende am Projekt möchten die CLI direkt aus dem Quellcode ausführen.

- **Entwicklungsmodus:**  
  Diese Methode bietet Hot-Reloading und eignet sich gut für aktive Entwicklung.  
  ```bash
  # Im Stammverzeichnis des Repositorys
  npm run start
  ```
- **Produktionsähnlicher Modus (verknüpftes Paket):**  
  Diese Methode simuliert eine globale Installation, indem das lokale Paket verknüpft wird. Sie ist nützlich, um einen lokalen Build innerhalb eines Produktions-Workflows zu testen.  

  ```bash
  # Verknüpfe das lokale CLI-Paket mit deinem globalen node_modules-Verzeichnis
  npm link packages/cli

  # Jetzt kannst du deine lokale Version mit dem Befehl `qwen` ausführen
  qwen
  ```

---

### 4. Die neueste Qwen Code-Commit-Version von GitHub ausführen

Sie können die zuletzt committete Version von Qwen Code direkt aus dem GitHub-Repository ausführen. Dies ist nützlich, um Funktionen zu testen, die sich noch in der Entwicklung befinden.

```bash

# CLI direkt vom Hauptbranch auf GitHub ausführen
npx https://github.com/QwenLM/qwen-code

## Bereitstellungsarchitektur

Die oben beschriebenen Ausführungsverfahren werden durch folgende architektonische Komponenten und Prozesse ermöglicht:

**NPM-Pakete**

Das Qwen Code-Projekt ist ein Monorepo, das Kernpakete im NPM-Registrierungssystem veröffentlicht:

- `@qwen-code/qwen-code-core`: Das Backend, das die Logik und die Ausführung von Tools verarbeitet.
- `@qwen-code/qwen-code`: Die benutzerseitige Oberfläche.

Diese Pakete werden bei der Standardinstallation sowie beim Ausführen von Qwen Code aus dem Quellcode verwendet.

**Build- und Verpackungsprozesse**

Je nach Verteilungskanal kommen zwei unterschiedliche Build-Prozesse zum Einsatz:

- **NPM-Veröffentlichung:** Für die Veröffentlichung im NPM-Registrierungssystem wird der TypeScript-Quellcode in `@qwen-code/qwen-code-core` und `@qwen-code/qwen-code` mithilfe des TypeScript-Compilers (`tsc`) in standardkonformen JavaScript-Code übersetzt. Das resultierende `dist/`-Verzeichnis wird im NPM-Paket veröffentlicht. Dies ist ein gängiger Ansatz für TypeScript-Bibliotheken.

- **GitHub-`npx`-Ausführung:** Beim direkten Ausführen der neuesten Version von Qwen Code direkt von GitHub wird ein anderer Prozess durch das `prepare`-Skript in `package.json` ausgelöst. Dieses Skript nutzt `esbuild`, um die gesamte Anwendung samt aller Abhängigkeiten in eine einzige, eigenständige JavaScript-Datei zu bündeln. Dieses Bundle wird dynamisch auf dem Rechner des Benutzers erstellt und nicht im Repository versioniert.

**Docker-Sandbox-Image**

Die Docker-basierte Ausführungsmethode wird durch das Container-Image `qwen-code-sandbox` unterstützt. Dieses Image wird in einer Container-Registry veröffentlicht und enthält eine vorinstallierte, globale Version von Qwen Code.

## Veröffentlichungsprozess

Der Veröffentlichungsprozess wird über GitHub Actions automatisiert. Der Veröffentlichungs-Workflow führt die folgenden Aktionen aus:

1.  Erstellen der NPM-Pakete mit `tsc`.
2.  Veröffentlichen der NPM-Pakete im Artefakt-Registry.
3.  Erstellen von GitHub-Veröffentlichungen mit gebündelten Assets.