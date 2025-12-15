# Wie du beitragen kannst

Wir freuen uns sehr über deine Patches und Beiträge zu diesem Projekt.

## Beitragungsprozess

### Code-Reviews

Alle Einreichungen, einschließlich solcher von Projektmitgliedern, müssen einer Überprüfung unterzogen werden. Wir verwenden dazu [GitHub Pull Requests](https://docs.github.com/articles/about-pull-requests).

### Richtlinien für Pull Requests

Um uns bei der schnellen Überprüfung und Zusammenführung deiner PRs zu unterstützen, beachte bitte die folgenden Richtlinien. PRs, die diesen Standards nicht entsprechen, können geschlossen werden.

#### 1. Verknüpfung mit einem bestehenden Issue

Alle PRs sollten mit einem bestehenden Issue in unserem Tracker verknüpft sein. Dies stellt sicher, dass jede Änderung vor dem Schreiben von Code besprochen und mit den Zielen des Projekts abgestimmt wurde.

- **Für Bugfixes:** Der PR sollte mit dem Issue des Fehlerberichts verknüpft werden.
- **Für Features:** Der PR sollte mit dem Issue der Feature-Anfrage oder dem Vorschlag verknüpft werden, der von einem Maintainer genehmigt wurde.

Falls noch kein Issue für deine Änderung existiert, **erstelle bitte zuerst eines** und warte auf Feedback, bevor du mit dem Codieren beginnst.

#### 2. Halte es klein und fokussiert

Wir bevorzugen kleine, atomare PRs, die ein einzelnes Problem behandeln oder ein einzelnes, eigenständiges Feature hinzufügen.

- **Tu es:** Erstelle einen PR, der einen bestimmten Fehler behebt oder eine bestimmte Funktion hinzufügt.
- **Tu es nicht:** Bündle mehrere unabhängige Änderungen (z. B. einen Bugfix, ein neues Feature und eine Refaktorisierung) in einem einzigen PR.

Große Änderungen sollten in eine Reihe kleinerer, logischer PRs unterteilt werden, die unabhängig voneinander überprüft und gemerged werden können.

#### 3. Verwende Entwurfs-PRs für laufende Arbeiten

Wenn du frühzeitiges Feedback zu deiner Arbeit erhalten möchtest, nutze bitte die Funktion **Draft Pull Request** von GitHub. Dies signalisiert den Maintainer:innen, dass der PR noch nicht bereit für eine formelle Überprüfung ist, aber für Diskussionen und erste Rückmeldungen geöffnet ist.

#### 4. Stelle sicher, dass alle Prüfungen erfolgreich sind

Bevor du deinen PR einreichst, stelle sicher, dass alle automatisierten Prüfungen erfolgreich sind, indem du `npm run preflight` ausführst. Dieser Befehl führt alle Tests, das Linting und andere Stilprüfungen durch.

#### 5. Aktualisiere die Dokumentation

Falls dein PR eine benutzerseitige Änderung einführt (z. B. ein neuer Befehl, ein modifizierter Parameter oder eine Verhaltensänderung), musst du auch die entsprechende Dokumentation im Verzeichnis `/docs` aktualisieren.

#### 6. Klare Commit-Nachrichten und eine gute PR-Beschreibung schreiben

Dein PR sollte einen klaren, beschreibenden Titel und eine detaillierte Beschreibung der Änderungen enthalten. Folge dem [Conventional Commits](https://www.conventionalcommits.org/)-Standard für deine Commit-Nachrichten.

- **Guter PR-Titel:** `feat(cli): Add --json flag to 'config get' command`
- **Schlechter PR-Titel:** `Made some changes`

Erkläre in der PR-Beschreibung die Gründe hinter deinen Änderungen und verlinke das relevante Issue (z. B. `Fixes #123`).

## Entwicklungsumgebung und Workflow

Dieser Abschnitt zeigt Mitwirkenden, wie sie das Projekt bauen, ändern und die Entwicklungsumgebung verstehen können.

### Einrichtung der Entwicklungsumgebung

**Voraussetzungen:**

1.  **Node.js**:
    - **Entwicklung:** Bitte verwenden Sie Node.js `~20.19.0`. Diese spezifische Version ist aufgrund eines Problems mit einer Upstream-Entwicklungsabhängigkeit erforderlich. Sie können ein Tool wie [nvm](https://github.com/nvm-sh/nvm) verwenden, um Node.js-Versionen zu verwalten.
    - **Produktion:** Für den Betrieb der CLI in einer Produktionsumgebung ist jede Version von Node.js `>=20` akzeptabel.
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

So bauen Sie das gesamte Projekt (alle Pakete):

```bash
npm run build
```

Dieser Befehl kompiliert typischerweise TypeScript in JavaScript, bündelt Assets und bereitet die Pakete für die Ausführung vor. Weitere Informationen zu den Abläufen während des Builds finden Sie in `scripts/build.js` und den Skripten in `package.json`.

### Aktivierung der Sandbox

[Sandboxing](#sandboxing) wird dringend empfohlen und erfordert mindestens das Setzen von `QWEN_SANDBOX=true` in Ihrer `~/.env` sowie die Verfügbarkeit eines Sandbox-Anbieters (z. B. `macOS Seatbelt`, `docker` oder `podman`). Weitere Details finden Sie unter [Sandboxing](#sandboxing).

Um sowohl das `qwen-code` CLI-Dienstprogramm als auch den Sandbox-Container zu erstellen, führen Sie `build:all` aus dem Stammverzeichnis aus:

```bash
npm run build:all
```

Um das Erstellen des Sandbox-Containers zu überspringen, können Sie stattdessen `npm run build` verwenden.

### Ausführen

Um die Qwen Code-Anwendung aus dem Quellcode zu starten (nach dem Build), führen Sie den folgenden Befehl aus dem Stammverzeichnis aus:

```bash
npm start
```

Wenn Sie den Quell-Build außerhalb des qwen-code-Ordners ausführen möchten, können Sie `npm link path/to/qwen-code/packages/cli` nutzen (siehe: [Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-link)), um mit `qwen-code` auszuführen.

### Ausführen von Tests

Dieses Projekt enthält zwei Arten von Tests: Unit-Tests und Integrationstests.

#### Unit-Tests

Um die Unit-Test-Suite für das Projekt auszuführen:

```bash
npm run test
```

Dies führt Tests in den Verzeichnissen `packages/core` und `packages/cli` aus. Stellen Sie sicher, dass alle Tests erfolgreich sind, bevor Sie Änderungen einreichen. Für eine umfassendere Prüfung wird empfohlen, `npm run preflight` auszuführen.

#### Integrationstests

Die Integrationstests dienen dazu, die End-to-End-Funktionalität von Qwen Code zu validieren. Sie werden nicht als Teil des Standardbefehls `npm run test` ausgeführt.

Um die Integrationstests auszuführen, verwenden Sie den folgenden Befehl:

```bash
npm run test:e2e
```

Für detailliertere Informationen zum Framework für Integrationstests, siehe [Dokumentation zu Integrationstests](./docs/integration-tests.md).

### Linting und Preflight-Checks

Um die Codequalität und Formatierungskonsistenz sicherzustellen, führe den Preflight-Check aus:

```bash
npm run preflight
```

Dieser Befehl führt ESLint, Prettier, alle Tests und weitere Prüfungen gemäß der Definition in der `package.json` des Projekts aus.

_ProTip_

Erstelle nach dem Klonen eine Git-Precommit-Hook-Datei, um sicherzustellen, dass deine Commits immer sauber sind.

```bash
echo "

# npm-Build ausführen und auf Fehler prüfen
if ! npm run preflight; then
  echo "npm build fehlgeschlagen. Commit abgebrochen."
  exit 1
fi
" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

#### Formatierung

Um den Code in diesem Projekt separat zu formatieren, führe den folgenden Befehl im Stammverzeichnis aus:

```bash
npm run format
```

Dieser Befehl verwendet Prettier, um den Code entsprechend den Style-Richtlinien des Projekts zu formatieren.

#### Linting

Um den Code in diesem Projekt separat zu linten, führe den folgenden Befehl im Stammverzeichnis aus:

```bash
npm run lint
```

### Coding-Konventionen

- Bitte halte dich an den Coding-Stil, die Muster und Konventionen, die im gesamten bestehenden Codebase verwendet werden.
- **Imports:** Achte besonders auf die Import-Pfade. Das Projekt verwendet ESLint, um Einschränkungen für relative Imports zwischen Paketen durchzusetzen.

### Projektstruktur

- `packages/`: Enthält die einzelnen Unterpakete des Projekts.
  - `cli/`: Die Befehlszeilenschnittstelle.
  - `core/`: Die Kern-Backend-Logik für Qwen Code.
- `docs/`: Enthält die gesamte Projektdokumentation.
- `scripts/`: Hilfsskripte zum Bauen, Testen und Entwicklungsaufgaben.

Für eine detailliertere Architektur siehe `docs/architecture.md`.

## Dokumentationsentwicklung

Dieser Abschnitt beschreibt, wie du die Dokumentation lokal entwickeln und in der Vorschau anzeigen kannst.

### Voraussetzungen

1. Stelle sicher, dass Node.js (Version 18+) installiert ist
2. Stelle sicher, dass npm oder yarn verfügbar sind

### Dokumentationsseite lokal einrichten

Um an der Dokumentation zu arbeiten und Änderungen lokal in der Vorschau anzusehen:

1. Navigiere zum Verzeichnis `docs-site`:

   ```bash
   cd docs-site
   ```

2. Installiere die Abhängigkeiten:

   ```bash
   npm install
   ```

3. Verknüpfe den Dokumentationsinhalt aus dem Hauptverzeichnis `docs`:

   ```bash
   npm run link
   ```

   Dies erstellt einen symbolischen Link von `../docs` zum Verzeichnis `content` im docs-site-Projekt, sodass der Dokumentationsinhalt von der Next.js-Site bereitgestellt werden kann.

4. Starte den Entwicklungsserver:

   ```bash
   npm run dev
   ```

5. Öffne [http://localhost:3000](http://localhost:3000) in deinem Browser, um die Dokumentationsseite mit Live-Aktualisierungen bei Änderungen zu sehen.

Alle Änderungen, die an den Dokumentationsdateien im Hauptverzeichnis `docs` vorgenommen werden, spiegeln sich sofort auf der Dokumentationsseite wider.

## Debugging

### VS Code:

0.  Führe die CLI aus, um interaktiv in VS Code mit `F5` zu debuggen
1.  Starte die CLI im Debug-Modus aus dem Stammverzeichnis:
    ```bash
    npm run debug
    ```
    Dieser Befehl führt `node --inspect-brk dist/index.js` innerhalb des Verzeichnisses `packages/cli` aus und hält die Ausführung an, bis ein Debugger angehängt wird. Du kannst dann `chrome://inspect` in deinem Chrome-Browser öffnen, um dich mit dem Debugger zu verbinden.
2.  Verwende in VS Code die Launch-Konfiguration „Attach“ (zu finden in `.vscode/launch.json`).

Alternativ kannst du die Konfiguration „Launch Program“ in VS Code verwenden, wenn du die aktuell geöffnete Datei direkt starten möchtest, aber `F5` ist im Allgemeinen empfohlen.

Um einen Haltepunkt innerhalb des Sandbox-Containers zu erreichen, führe Folgendes aus:

```bash
DEBUG=1 qwen-code
```

**Hinweis:** Wenn du `DEBUG=true` in der `.env`-Datei eines Projekts hast, wirkt sich dies nicht auf qwen-code aus, da es automatisch ausgeschlossen wird. Verwende `.qwen-code/.env`-Dateien für qwen-code-spezifische Debug-Einstellungen.

### React DevTools

Um die React-basierte Benutzeroberfläche der CLI zu debuggen, kannst du React DevTools verwenden. Ink, die Bibliothek, die für die CLI-Oberfläche verwendet wird, ist mit React DevTools Version 4.x kompatibel.

1.  **Starte die Qwen Code-Anwendung im Entwicklungsmodus:**

    ```bash
    DEV=true npm start
    ```

2.  **Installiere und führe React DevTools Version 4.28.5 (oder die neueste kompatible 4.x-Version) aus:**

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

## Manuelles Veröffentlichen

Wir veröffentlichen ein Artefakt für jeden Commit in unserer internen Registry. Wenn du jedoch einen lokalen Build manuell erstellen musst, führe die folgenden Befehle aus:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```