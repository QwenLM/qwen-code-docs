# So kannst du beitragen

Wir freuen uns über deine Patches und Beiträge zu diesem Projekt.

## Beitragsprozess

### Code Reviews

Alle Einreichungen, einschließlich solcher von Projektmitgliedern, erfordern ein Review. Wir verwenden dafür [GitHub Pull Requests](https://docs.github.com/articles/about-pull-requests).

### Richtlinien für Pull Requests

Damit wir deine PRs schnell reviewen und mergen können, halte dich bitte an diese Richtlinien. PRs, die diese Standards nicht erfüllen, können geschlossen werden.

#### 1. Verknüpfung mit einem bestehenden Issue

Alle PRs sollten mit einem bestehenden Issue in unserem Tracker verknüpft sein. So wird sichergestellt, dass jede Änderung diskutiert und mit den Projektzielen abgestimmt ist, bevor Code geschrieben wird.

- **Für Bugfixes:** Der PR sollte mit dem Issue zum Bugreport verknüpft sein.
- **Für Features:** Der PR sollte mit dem Feature-Request oder Vorschlag verknüpft sein, der von einem Maintainer genehmigt wurde.

Falls noch kein Issue für deine Änderung existiert, **erstelle bitte zuerst eines** und warte auf Feedback, bevor du mit dem Coding beginnst.

#### 2. Klein und fokussiert halten

Wir bevorzugen kleine, atomare PRs, die ein einzelnes Issue beheben oder ein einzelnes, in sich geschlossenes Feature hinzufügen.

- **Empfohlen:** Erstelle einen PR, der einen bestimmten Bug behebt oder ein bestimmtes Feature hinzufügt.
- **Vermeiden:** Bündele mehrere unabhängige Änderungen (z. B. einen Bugfix, ein neues Feature und ein Refactoring) in einem einzigen PR.

Große Änderungen sollten in eine Reihe kleinerer, logischer PRs aufgeteilt werden, die unabhängig voneinander reviewt und gemerged werden können.

#### 3. Draft PRs für Work in Progress verwenden

Wenn du frühzeitig Feedback zu deiner Arbeit erhalten möchtest, verwende bitte die **Draft Pull Request**-Funktion von GitHub. Dies signalisiert den Maintainern, dass der PR noch nicht für ein formelles Review bereit ist, aber für Diskussionen und erstes Feedback offensteht.

#### 4. Sicherstellen, dass alle Checks durchlaufen

Bevor du deinen PR einreichst, stelle sicher, dass alle automatisierten Checks durchlaufen, indem du `npm run preflight` ausführst. Dieser Befehl führt alle Tests, Linting und weitere Style-Checks aus.

#### 5. Dokumentation aktualisieren

Wenn dein PR eine nutzerseitige Änderung einführt (z. B. einen neuen Befehl, ein geändertes Flag oder eine Verhaltensänderung), musst du auch die entsprechende Dokumentation im `/docs`-Verzeichnis aktualisieren.

#### 6. Klare Commit Messages und eine gute PR-Beschreibung verfassen

Dein PR sollte einen klaren, beschreibenden Titel und eine detaillierte Beschreibung der Änderungen enthalten. Halte dich für deine Commit Messages an den [Conventional Commits](https://www.conventionalcommits.org/)-Standard.

- **Guter PR-Titel:** `feat(cli): Add --json flag to 'config get' command`
- **Schlechter PR-Titel:** `Made some changes`

Erkläre in der PR-Beschreibung das „Warum“ hinter deinen Änderungen und verlinke das relevante Issue (z. B. `Fixes #123`).

## Entwicklungsumgebung und Workflow

Dieser Abschnitt erklärt Contributoren, wie sie das Projekt bauen, ändern und die Entwicklungsumgebung verstehen.

### Entwicklungsumgebung einrichten

**Voraussetzungen:**

1.  **Node.js**:
    - **Entwicklung:** Bitte verwende Node.js `~20.19.0`. Diese spezifische Version ist aufgrund eines Problems mit einer Upstream-Development-Dependency erforderlich. Du kannst ein Tool wie [nvm](https://github.com/nvm-sh/nvm) verwenden, um Node.js-Versionen zu verwalten.
    - **Produktion:** Zum Ausführen der CLI in einer Produktionsumgebung ist jede Node.js-Version `>=20` geeignet.
2.  **Git**

### Build-Prozess

So klont du das Repository:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Or your fork's URL
cd qwen-code
```

Um die in `package.json` definierten Abhängigkeiten sowie die Root-Abhängigkeiten zu installieren:

```bash
npm install
```

Um das gesamte Projekt (alle Packages) zu bauen:

```bash
npm run build
```

Dieser Befehl kompiliert in der Regel TypeScript zu JavaScript, bündelt Assets und bereitet die Packages zur Ausführung vor. Weitere Details zum Build-Vorgang findest du in `scripts/build.js` und den Scripts in `package.json`.

### Sandboxing aktivieren

[Sandboxing](#sandboxing) wird dringend empfohlen und erfordert mindestens das Setzen von `QWEN_SANDBOX=true` in deiner `~/.env` sowie die Verfügbarkeit eines Sandboxing-Providers (z. B. `macOS Seatbelt`, `docker` oder `podman`). Details findest du unter [Sandboxing](#sandboxing).

Um sowohl das `qwen-code` CLI-Tool als auch den Sandbox-Container zu bauen, führe `build:all` im Root-Verzeichnis aus:

```bash
npm run build:all
```

Um das Bauen des Sandbox-Containers zu überspringen, kannst du stattdessen `npm run build` verwenden.

### Ausführen

Um die Qwen Code-Anwendung aus dem Quellcode zu starten (nach dem Build), führe folgenden Befehl im Root-Verzeichnis aus:

```bash
npm start
```

Wenn du den Source-Build außerhalb des `qwen-code`-Ordners ausführen möchtest, kannst du `npm link path/to/qwen-code/packages/cli` verwenden (siehe: [Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-link)), um es mit `qwen-code` auszuführen.

### Tests ausführen

Dieses Projekt enthält zwei Arten von Tests: Unit-Tests und Integrationstests.

#### Unit-Tests

Um die Unit-Test-Suite des Projekts auszuführen:

```bash
npm run test
```

Dies führt Tests in den Verzeichnissen `packages/core` und `packages/cli` aus. Stelle sicher, dass alle Tests durchlaufen, bevor du Änderungen einreichst. Für eine umfassendere Prüfung wird empfohlen, `npm run preflight` auszuführen.

#### Integrationstests

Die Integrationstests dienen der Validierung der End-to-End-Funktionalität von Qwen Code. Sie werden nicht standardmäßig mit `npm run test` ausgeführt.

Um die Integrationstests auszuführen, verwende folgenden Befehl:

```bash
npm run test:e2e
```

Detaillierte Informationen zum Integrationstest-Framework findest du in der [Dokumentation zu Integrationstests](./docs/integration-tests.md).

### Linting und Preflight-Checks

Um Codequalität und Formatierungskonsistenz sicherzustellen, führe den Preflight-Check aus:

```bash
npm run preflight
```

Dieser Befehl führt ESLint, Prettier, alle Tests und weitere Checks aus, wie in der `package.json` des Projekts definiert.

_Pro-Tipp_

Erstelle nach dem Klonen eine Git-Precommit-Hook-Datei, um sicherzustellen, dass deine Commits immer sauber sind.

```bash
echo "
# Run npm build and check for errors
if ! npm run preflight; then
  echo "npm build failed. Commit aborted."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatierung

Um den Code in diesem Projekt separat zu formatieren, führe folgenden Befehl im Root-Verzeichnis aus:

```bash
npm run format
```

Dieser Befehl verwendet Prettier, um den Code gemäß den Style-Richtlinien des Projekts zu formatieren.

#### Linting

Um den Code in diesem Projekt separat zu linten, führe folgenden Befehl im Root-Verzeichnis aus:

```bash
npm run lint
```

### Coding-Konventionen

- Bitte halte dich an den Coding-Style, die Patterns und Konventionen, die in der bestehenden Codebase verwendet werden.
- **Imports:** Achte besonders auf Import-Pfade. Das Projekt verwendet ESLint, um Einschränkungen für relative Imports zwischen Packages durchzusetzen.

### Projektstruktur

- `packages/`: Enthält die einzelnen Sub-Packages des Projekts.
  - `cli/`: Die Command-Line-Interface (CLI).
  - `core/`: Die zentrale Backend-Logik für Qwen Code.
- `docs/`: Enthält die gesamte Projektdokumentation.
- `scripts/`: Utility-Scripts für Build-, Test- und Entwicklungsaufgaben.

Für eine detailliertere Architekturübersicht siehe `docs/architecture.md`.

## Dokumentationsentwicklung

Dieser Abschnitt beschreibt, wie du die Dokumentation lokal entwickelst und eine Vorschau anzeigst.

### Voraussetzungen

1. Stelle sicher, dass Node.js (Version 18+) installiert ist
2. npm oder yarn muss verfügbar sein

### Dokumentation lokal einrichten

Um an der Dokumentation zu arbeiten und Änderungen lokal in der Vorschau anzuzeigen:

1. Wechsle in das `docs-site`-Verzeichnis:

   ```bash
   cd docs-site
   ```

2. Installiere die Abhängigkeiten:

   ```bash
   npm install
   ```

3. Verlinke den Dokumentationsinhalt aus dem Haupt-`docs`-Verzeichnis:

   ```bash
   npm run link
   ```

   Dies erstellt einen symbolischen Link von `../docs` zu `content` im docs-site-Projekt, sodass der Dokumentationsinhalt von der Next.js-Site bereitgestellt werden kann.

4. Starte den Development-Server:

   ```bash
   npm run dev
   ```

5. Öffne [http://localhost:3000](http://localhost:3000) in deinem Browser, um die Dokumentationsseite mit Live-Updates während der Bearbeitung zu sehen.

Alle Änderungen an den Dokumentationsdateien im Haupt-`docs`-Verzeichnis werden sofort auf der Dokumentationsseite übernommen.

## Debugging

### VS Code:

0.  Starte die CLI, um interaktiv in VS Code mit `F5` zu debuggen
1.  Starte die CLI im Debug-Modus aus dem Root-Verzeichnis:
    ```bash
    npm run debug
    ```
    Dieser Befehl führt `node --inspect-brk dist/index.js` im `packages/cli`-Verzeichnis aus und pausiert die Ausführung, bis ein Debugger verbunden ist. Du kannst dann `chrome://inspect` in deinem Chrome-Browser öffnen, um dich mit dem Debugger zu verbinden.
2.  Verwende in VS Code die "Attach"-Launch-Konfiguration (zu finden in `.vscode/launch.json`).

Alternativ kannst du die "Launch Program"-Konfiguration in VS Code verwenden, wenn du die aktuell geöffnete Datei direkt starten möchtest. `F5` wird jedoch generell empfohlen.

Um einen Breakpoint im Sandbox-Container zu erreichen, führe aus:

```bash
DEBUG=1 qwen-code
```

**Hinweis:** Wenn `DEBUG=true` in einer `.env`-Datei eines Projekts steht, wirkt sich dies aufgrund des automatischen Ausschlusses nicht auf qwen-code aus. Verwende `.qwen-code/.env`-Dateien für qwen-code-spezifische Debug-Einstellungen.

### React DevTools

Um die React-basierte UI der CLI zu debuggen, kannst du React DevTools verwenden. Ink, die für das CLI-Interface verwendete Bibliothek, ist mit React DevTools Version 4.x kompatibel.

1.  **Starte die Qwen Code-Anwendung im Development-Modus:**

    ```bash
    DEV=true npm start
    ```

2.  **Installiere und starte React DevTools Version 4.28.5 (oder die neueste kompatible 4.x-Version):**

    Du kannst es entweder global installieren:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Oder direkt mit npx ausführen:

    ```bash
    npx react-devtools@4.28.5
    ```

    Deine laufende CLI-Anwendung sollte sich dann mit React DevTools verbinden.

## Sandboxing

> TBD

## Manuelles Publishen

Wir veröffentlichen für jeden Commit ein Artifact in unserer internen Registry. Wenn du jedoch manuell einen lokalen Build erstellen musst, führe folgende Befehle aus:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```