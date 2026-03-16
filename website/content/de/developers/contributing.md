# Wie Sie beitragen können

Wir würden uns sehr freuen, Ihre Patches und Beiträge zu diesem Projekt zu erhalten.

## Beitragungsprozess

### Code-Reviews

Alle Einreichungen – auch von Projektmitgliedern – müssen überprüft werden. Zu diesem Zweck verwenden wir [GitHub-Pull-Requests](https://docs.github.com/articles/about-pull-requests).

### Richtlinien für Pull Requests

Um uns bei der schnellen Überprüfung und dem Zusammenführen Ihrer Pull Requests zu unterstützen, beachten Sie bitte die folgenden Richtlinien. Pull Requests, die diesen Standards nicht entsprechen, können geschlossen werden.

#### 1. Verknüpfung mit einem bestehenden Issue

Alle Pull Requests (PRs) müssen mit einem bestehenden Issue in unserem Issue-Tracker verknüpft sein. Dadurch wird sichergestellt, dass jede Änderung vor dem Schreiben von Code besprochen wurde und mit den Zielen des Projekts übereinstimmt.

- **Bei Fehlerbehebungen:** Der PR muss mit dem entsprechenden Bug-Report verknüpft sein.  
- **Bei neuen Funktionen:** Der PR muss mit dem Issue für die Funktionsanforderung oder -vorschlag verknüpft sein, das zuvor von einem Maintainer genehmigt wurde.

Falls kein passendes Issue für Ihre Änderung existiert, erstellen Sie bitte **zuerst ein neues Issue**, und warten Sie auf Feedback, bevor Sie mit der Implementierung beginnen.

#### 2. Halten Sie den Umfang klein und fokussiert

Wir bevorzugen kleine, atomare PRs, die jeweils nur ein einzelnes Problem beheben oder eine einzige, eigenständige Funktion hinzufügen.

- **Empfohlen:** Erstellen Sie einen PR, der genau einen bestimmten Fehler behebt oder genau eine bestimmte Funktion hinzufügt.  
- **Nicht empfohlen:** Fassen Sie mehrere nicht zusammenhängende Änderungen (z. B. eine Fehlerbehebung, eine neue Funktion und eine Refaktorisierung) in einem einzigen PR zusammen.

Umfangreiche Änderungen sollten in eine Reihe kleinerer, logisch zusammenhängender PRs aufgeteilt werden, die unabhängig voneinander überprüft und gemergt werden können.

#### 3. Verwenden Sie Entwurfs-PRs für laufende Arbeiten

Falls Sie frühzeitig Feedback zu Ihrer Arbeit erhalten möchten, nutzen Sie bitte die Funktion **Entwurfs-Pull-Request** von GitHub. Damit signalisieren Sie den Maintainer:innen, dass der PR noch nicht für eine formale Überprüfung bereit ist, aber bereits für Diskussionen und erstes Feedback geöffnet ist.

#### 4. Stellen Sie sicher, dass alle Prüfungen erfolgreich sind

Bevor Sie Ihren PR einreichen, stellen Sie sicher, dass alle automatisierten Prüfungen bestanden werden, indem Sie `npm run preflight` ausführen. Dieser Befehl führt alle Tests, das Linting sowie weitere Style-Prüfungen durch.

#### 5. Aktualisieren Sie die Dokumentation

Falls Ihr PR eine Änderung betrifft, die sich auf Nutzer:innen auswirkt (z. B. ein neuer Befehl, eine geänderte Option oder eine Verhaltensänderung), müssen Sie auch die entsprechende Dokumentation im Verzeichnis `/docs` aktualisieren.

#### 6. Klare Commit-Nachrichten und eine gute PR-Beschreibung schreiben

Ihre Pull Request (PR) sollte einen klaren, aussagekräftigen Titel sowie eine detaillierte Beschreibung der Änderungen enthalten. Verwenden Sie für Ihre Commit-Nachrichten den Standard [Conventional Commits](https://www.conventionalcommits.org/).

- **Guter PR-Titel:** `feat(cli): Flag --json zum Befehl „config get“ hinzufügen`
- **Schlechter PR-Titel:** `Einige Änderungen vorgenommen`

Erklären Sie in der PR-Beschreibung den Grund („Warum?“) für Ihre Änderungen und verlinken Sie die zugehörige Issue (z. B. `Fixes #123`).

## Einrichtung und Workflow für die Entwicklung

Dieser Abschnitt führt Mitwirkende durch den Aufbau, die Anpassung und das Verständnis der Entwicklungs-Umgebung dieses Projekts.

### Einrichten der Entwicklungsumgebung

**Voraussetzungen:**

1.  **Node.js**:
    - **Entwicklung:** Verwenden Sie bitte Node.js `~20.19.0`. Diese spezifische Version ist aufgrund eines Problems mit einer Abhängigkeit in einer externen Bibliothek erforderlich. Sie können ein Tool wie [nvm](https://github.com/nvm-sh/nvm) verwenden, um verschiedene Node.js-Versionen zu verwalten.
    - **Produktion:** Für den Betrieb der CLI in einer Produktionsumgebung ist jede Node.js-Version `>=20` akzeptabel.
2.  **Git**

### Build-Prozess

So klonen Sie das Repository:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Oder die URL Ihres Forks
cd qwen-code
```

So installieren Sie die in `package.json` definierten Abhängigkeiten sowie die Root-Abhängigkeiten:

```bash
npm install
```

So erstellen Sie das gesamte Projekt (alle Pakete):

```bash
npm run build
```

Dieser Befehl kompiliert typischerweise TypeScript nach JavaScript, fasst Ressourcen zusammen und bereitet die Pakete für die Ausführung vor. Weitere Details zum Build-Vorgang finden Sie in `scripts/build.js` und den Skripten in `package.json`.

### Sandbox aktivieren

Die [Sandbox](#sandboxing) wird dringend empfohlen und erfordert mindestens die Festlegung von `QWEN_SANDBOX=true` in Ihrer Datei `~/.env` sowie die Verfügbarkeit eines Sandbox-Anbieters (z. B. `macOS Seatbelt`, `docker` oder `podman`). Weitere Einzelheiten finden Sie unter [Sandbox](#sandboxing).

Um sowohl das CLI-Tool `qwen-code` als auch den Sandbox-Container zu erstellen, führen Sie im Stammverzeichnis den Befehl `build:all` aus:

```bash
npm run build:all
```

Um das Erstellen des Sandbox-Containers zu überspringen, können Sie stattdessen `npm run build` verwenden.

### Ausführen

Um die Qwen Code-Anwendung aus dem Quellcode heraus zu starten (nach dem Build-Vorgang), führen Sie den folgenden Befehl im Stammverzeichnis aus:

```bash
npm start
```

Falls Sie die Quellcode-Version außerhalb des Ordners `qwen-code` ausführen möchten, können Sie `npm link path/to/qwen-code/packages/cli` verwenden (siehe: [Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-link)), um `qwen-code` auszuführen.

### Tests ausführen

Dieses Projekt enthält zwei Arten von Tests: Unit-Tests und Integrations-Tests.

#### Komponententests

Um die Komponententestsuite für das Projekt auszuführen:

```bash
npm run test
```

Damit werden Tests in den Verzeichnissen `packages/core` und `packages/cli` ausgeführt. Stellen Sie sicher, dass alle Tests erfolgreich durchlaufen, bevor Sie Änderungen einreichen. Für eine umfassendere Prüfung wird empfohlen, `npm run preflight` auszuführen.

#### Integrationstests

Die Integrationstests dienen der Validierung der End-to-End-Funktionalität von Qwen Code. Sie werden nicht automatisch im Rahmen des Standardbefehls `npm run test` ausgeführt.

Um die Integrationstests auszuführen, verwenden Sie folgenden Befehl:

```bash
npm run test:e2e
```

Weitere detaillierte Informationen zum Integrationstest-Framework finden Sie in der [Dokumentation zu Integrationstests](./docs/integration-tests.md).

### Überprüfung und Vorab-Checks

Um die Codequalität und Formatierungskonsistenz sicherzustellen, führen Sie den Vorab-Check aus:

```bash
npm run preflight
```

Dieser Befehl führt ESLint, Prettier, alle Tests sowie weitere in der `package.json` des Projekts definierte Checks aus.

_ProTip_

Erstellen Sie nach dem Klonen ein Git-Pre-Commit-Hook-Skript, um sicherzustellen, dass Ihre Commits stets sauber sind.

```bash
echo "

# Führe npm build aus und prüfe auf Fehler
if ! npm run preflight; then
  echo "npm build fehlgeschlagen. Commit abgebrochen."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatierung

Um den Code in diesem Projekt separat zu formatieren, führen Sie den folgenden Befehl im Stammverzeichnis aus:

```bash
npm run format
```

Dieser Befehl verwendet Prettier, um den Code gemäß den Formatierungsrichtlinien des Projekts zu formatieren.

#### Linting

Um den Code in diesem Projekt separat zu überprüfen, führen Sie den folgenden Befehl im Stammverzeichnis aus:

```bash
npm run lint
```

### Codierkonventionen

- Bitte halten Sie sich an den Codierstil, die Muster und Konventionen, die im bestehenden Codebase verwendet werden.
- **Importe:** Achten Sie besonders auf die Importpfade. Das Projekt verwendet ESLint, um Einschränkungen für relative Imports zwischen Paketen durchzusetzen.

### Projektstruktur

- `packages/`: Enthält die einzelnen Teilpakete des Projekts.
  - `cli/`: Die Befehlszeilenschnittstelle.
  - `core/`: Die zentrale Backend-Logik für Qwen Code.
- `docs/`: Enthält die gesamte Projekt-Dokumentation.
- `scripts/`: Hilfsskripte für Build-, Test- und Entwicklungs-Aufgaben.

Für eine detailliertere Architekturbeschreibung siehe `docs/architecture.md`.

## Dokumentationsentwicklung

Dieser Abschnitt beschreibt, wie Sie die Dokumentation lokal entwickeln und vorab anzeigen können.

### Voraussetzungen

1. Stellen Sie sicher, dass Node.js (Version 18+) installiert ist.
2. Stellen Sie sicher, dass npm oder yarn verfügbar ist.

### Dokumentationswebsite lokal einrichten

Um an der Dokumentation zu arbeiten und Änderungen lokal vorzubetrachten:

1. Wechseln Sie in das Verzeichnis `docs-site`:

   ```bash
   cd docs-site
   ```

2. Installieren Sie die Abhängigkeiten:

   ```bash
   npm install
   ```

3. Verknüpfen Sie den Dokumentationsinhalt aus dem Hauptverzeichnis `docs`:

   ```bash
   npm run link
   ```

   Dadurch wird eine symbolische Verknüpfung von `../docs` nach `content` im `docs-site`-Projekt erstellt, sodass der Dokumentationsinhalt von der Next.js-Website bereitgestellt werden kann.

4. Starten Sie den Entwicklungsserver:

   ```bash
   npm run dev
   ```

5. Öffnen Sie [http://localhost:3000](http://localhost:3000) in Ihrem Browser, um die Dokumentationswebsite mit Live-Updates bei Ihren Änderungen anzuzeigen.

Alle Änderungen an den Dokumentationsdateien im Hauptverzeichnis `docs` werden sofort auf der Dokumentationswebsite sichtbar.  

## Debugging

### VS Code:

0.  Führen Sie die CLI aus, um interaktiv mit `F5` in VS Code zu debuggen.
1.  Starten Sie die CLI im Debug-Modus ab dem Stammverzeichnis:
    ```bash
    npm run debug
    ```
    Dieser Befehl führt `node --inspect-brk dist/index.js` im Verzeichnis `packages/cli` aus und unterbricht die Ausführung, bis ein Debugger angehängt wird. Anschließend können Sie `chrome://inspect` in Ihrem Chrome-Browser öffnen, um eine Verbindung zum Debugger herzustellen.
2.  Verwenden Sie in VS Code die Startkonfiguration „Anhängen“ (in `.vscode/launch.json` definiert).

Alternativ können Sie in VS Code auch die Startkonfiguration „Programm starten“ verwenden, wenn Sie das aktuell geöffnete Datei direkt ausführen möchten. Allerdings wird `F5` im Allgemeinen empfohlen.

Um einen Haltepunkt innerhalb des Sandbox-Containers zu erreichen, führen Sie Folgendes aus:

```bash
DEBUG=1 qwen-code
```

**Hinweis:** Falls Sie `DEBUG=true` in der Datei `.env` eines Projekts gesetzt haben, hat dies keine Auswirkung auf `qwen-code`, da diese automatisch ausgeschlossen wird. Verwenden Sie stattdessen `.qwen-code/.env`-Dateien für `qwen-code`-spezifische Debug-Einstellungen.

### React DevTools

Um die auf React basierende Benutzeroberfläche der CLI zu debuggen, können Sie React DevTools verwenden. Ink, die Bibliothek, die für die CLI-Oberfläche genutzt wird, ist mit React DevTools Version 4.x kompatibel.

1.  **Starten Sie die Qwen Code-Anwendung im Entwicklungsmodus:**

    ```bash
    DEV=true npm start
    ```

2.  **Installieren und ausführen Sie React DevTools Version 4.28.5 (oder die neueste kompatible 4.x-Version):**

    Sie können React DevTools entweder global installieren:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Oder direkt über `npx` ausführen:

    ```bash
    npx react-devtools@4.28.5
    ```

    Ihre laufende CLI-Anwendung sollte dann eine Verbindung zu React DevTools herstellen.

## Sandbox-Umgebung

> Noch nicht festgelegt

## Manuelles Veröffentlichen

Wir veröffentlichen für jeden Commit ein Artefakt in unserem internen Registry-System. Falls Sie jedoch manuell einen lokalen Build erstellen müssen, führen Sie die folgenden Befehle aus:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```