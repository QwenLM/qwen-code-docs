# Wie Sie beitragen können

Wir freuen uns über Ihre Patches und Beiträge zu diesem Projekt.

## Beitragsprozess

### Code-Reviews

Alle Einreichungen, einschließlich derer von Projektmitgliedern, erfordern eine Überprüfung. Wir verwenden dafür [GitHub Pull Requests](https://docs.github.com/articles/about-pull-requests).

### Richtlinien für Pull Requests

Um uns zu helfen, Ihre PRs schnell zu überprüfen und zu mergen, befolgen Sie bitte diese Richtlinien. PRs, die diese Standards nicht erfüllen, können geschlossen werden.

#### 1. Verknüpfung mit einem bestehenden Issue

Alle PRs sollten mit einem bestehenden Issue in unserem Tracker verknüpft sein. So wird sichergestellt, dass jede Änderung diskutiert wurde und mit den Projektzielen übereinstimmt, bevor Code geschrieben wird.

- **Für Fehlerbehebungen:** Der PR sollte mit dem Bug-Report-Issue verknüpft sein.
- **Für Funktionen:** Der PR sollte mit dem Feature-Request- oder Vorschlags-Issue verknüpft sein, das von einem Maintainer genehmigt wurde.

Wenn es noch kein Issue für Ihre Änderung gibt, **erstellen Sie bitte zuerst eines** und warten Sie auf Feedback, bevor Sie mit dem Programmieren beginnen.

#### 2. Halten Sie es klein und fokussiert

Wir bevorzugen kleine, atomare PRs, die ein einzelnes Problem beheben oder eine einzelne, in sich geschlossene Funktion hinzufügen.

- **Tun:** Erstellen Sie einen PR, der einen bestimmten Fehler behebt oder eine bestimmte Funktion hinzufügt.
- **Nicht tun:** Bündeln Sie mehrere nicht zusammenhängende Änderungen (z. B. eine Fehlerbehebung, eine neue Funktion und eine Refaktorisierung) in einem einzigen PR.

Als Faustregel gilt: Beginnen Sie mit der Aufteilung eines PRs, sobald er etwa 1.200 geänderte Zeilen überschreitet. PRs mit mehr als etwa 2.000 geänderten Zeilen sollten entweder in eine Reihe kleinerer, logischer PRs aufgeteilt werden, die unabhängig voneinander überprüft und gemergt werden können, oder es sollte in der PR-Beschreibung erklärt werden, warum die Änderung zusammen eingebracht werden muss.

#### 3. Verwenden Sie Draft-PRs für laufende Arbeiten

Wenn Sie frühzeitig Feedback zu Ihrer Arbeit erhalten möchten, verwenden Sie bitte die **Draft Pull Request**-Funktion von GitHub. Dies signalisiert den Maintainern, dass der PR noch nicht für eine formelle Überprüfung bereit ist, aber für Diskussionen und erstes Feedback offen ist.

#### 4. Stellen Sie sicher, dass alle Prüfungen bestanden werden

Bevor Sie Ihren PR einreichen, stellen Sie sicher, dass alle automatisierten Prüfungen bestanden werden, indem Sie `npm run preflight` ausführen. Dieser Befehl führt alle Tests, Linting und andere Stilprüfungen durch.

#### 5. Aktualisieren Sie die Dokumentation

Wenn Ihr PR eine benutzerseitige Änderung einführt (z. B. einen neuen Befehl, ein geändertes Flag oder eine Verhaltensänderung), müssen Sie auch die entsprechende Dokumentation im `/docs`-Verzeichnis aktualisieren.

#### 6. Schreiben Sie klare Commit-Nachrichten und eine gute PR-Beschreibung

Ihr PR sollte einen klaren, beschreibenden Titel und eine detaillierte Beschreibung der Änderungen haben. Befolgen Sie den [Conventional Commits](https://www.conventionalcommits.org/)-Standard für Ihre Commit-Nachrichten.

- **Guter PR-Titel:** `feat(cli): Add --json flag to 'config get' command`
- **Schlechter PR-Titel:** `Made some changes`

Erklären Sie in der PR-Beschreibung das "Warum" hinter Ihren Änderungen und verlinken Sie auf das relevante Issue (z. B. `Fixes #123`).

## Entwicklungseinrichtung und Workflow

Dieser Abschnitt führt Beitragende durch die Einrichtung, Änderung und das Verständnis des Entwicklungssetups dieses Projekts.

### Einrichten der Entwicklungsumgebung

**Voraussetzungen:**

1.  **Node.js**:
    - **Entwicklung:** Bitte verwenden Sie Node.js `>=22`. Ink 7 (vom TUI verwendet) benötigt Node 22, und `react@^19.2.0` ist das passende Peer-Dependency. Sie können ein Tool wie [nvm](https://github.com/nvm-sh/nvm) verwenden, um Node.js-Versionen zu verwalten.
    - **Produktion:** Für die Ausführung der CLI in einer Produktionsumgebung ist jede Version von Node.js `>=22` akzeptabel.
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

Dieser Befehl kompiliert in der Regel TypeScript in JavaScript, bündelt Assets und bereitet die Pakete für die Ausführung vor. Weitere Informationen darüber, was während des Builds passiert, finden Sie in `scripts/build.js` und den Skripten in `package.json`.

### Aktivieren der Sandbox

[Sandboxing](#sandboxing) wird dringend empfohlen und erfordert mindestens das Setzen von `QWEN_SANDBOX=true` in Ihrer `~/.env` und die Verfügbarkeit eines Sandboxing-Anbieters (z. B. `macOS Seatbelt`, `docker` oder `podman`). Weitere Informationen finden Sie unter [Sandboxing](#sandboxing).

Um sowohl das `qwen-code` CLI-Dienstprogramm als auch den Sandbox-Container zu erstellen, führen Sie `build:all` aus dem Root-Verzeichnis aus:

```bash
npm run build:all
```

Um das Erstellen des Sandbox-Containers zu überspringen, können Sie stattdessen `npm run build` verwenden.

### Ausführen

Um die Qwen Code-Anwendung aus dem Quellcode zu starten (nach dem Build), führen Sie den folgenden Befehl aus dem Root-Verzeichnis aus:

```bash
npm start
```

Wenn Sie den Quellcode-Build außerhalb des qwen-code-Ordners ausführen möchten, können Sie `npm link path/to/qwen-code/packages/cli` verwenden (siehe: [Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-link)), um ihn mit `qwen-code` auszuführen.

### Ausführen von Tests

Dieses Projekt enthält zwei Arten von Tests: Unit-Tests und Integrationstests.

#### Unit-Tests

So führen Sie die Unit-Testsuite für das Projekt aus:

```bash
npm run test
```
Dies führt Tests in den Verzeichnissen `packages/core` und `packages/cli` aus. Stelle sicher, dass alle Tests bestanden werden, bevor du Änderungen einreichst. Für eine umfassendere Überprüfung wird empfohlen, `npm run preflight` auszuführen.

#### Integrationstests

Die Integrationstests dienen der Überprüfung der End-to-End-Funktionalität von Qwen Code. Sie sind nicht Teil des standardmäßigen `npm run test`-Befehls.

Führe folgenden Befehl aus, um die Integrationstests zu starten:

```bash
npm run test:e2e
```

Weitere Details zum Framework für Integrationstests findest du in der [Integrationstests-Dokumentation](./development/integration-tests.md).

### Linting und Preflight-Prüfungen

Führe die Preflight-Prüfung durch, um Codequalität und konsistente Formatierung sicherzustellen:

```bash
npm run preflight
```

Dieser Befehl führt ESLint, Prettier, alle Tests und weitere Prüfungen aus, wie in der `package.json` des Projekts definiert.

_ProTip_

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

Um den Code in diesem Projekt separat zu formatieren, führe folgenden Befehl aus dem Stammverzeichnis aus:

```bash
npm run format
```

Dieser Befehl verwendet Prettier, um den Code gemäß den Projektstilrichtlinien zu formatieren.

#### Linting

Um den Code in diesem Projekt separat zu linten, führe folgenden Befehl aus dem Stammverzeichnis aus:

```bash
npm run lint
```

### Codierkonventionen

- Halte dich an den Codierstil, die Muster und Konventionen, die im bestehenden Codebase verwendet werden.
- **Importe:** Achte besonders auf Importpfade. Das Projekt verwendet ESLint, um relative Importe zwischen Paketen einzuschränken.

### Projektstruktur

- `packages/`: Enthält die einzelnen Unterpakete des Projekts.
  - `cli/`: Die Kommandozeilenschnittstelle.
  - `core/`: Die Kern-Backend-Logik für Qwen Code.
- `docs/`: Enthält die gesamte Projektdokumentation.
- `scripts/`: Hilfsskripte für Build-, Test- und Entwicklungsaufgaben.

Weitere Details zur Architektur findest du in `docs/architecture.md`.

## Dokumentationsentwicklung

Dieser Abschnitt beschreibt, wie die Dokumentation lokal entwickelt und in der Vorschau betrachtet werden kann.

### Voraussetzungen

1. Stelle sicher, dass Node.js (Version 22+) installiert ist.
2. npm oder yarn müssen verfügbar sein.

### Dokumentationsseite lokal einrichten

Um an der Dokumentation zu arbeiten und Änderungen lokal in der Vorschau anzuzeigen:

1. Navigiere in das Verzeichnis `docs-site`:

   ```bash
   cd docs-site
   ```

2. Installiere die Abhängigkeiten:

   ```bash
   npm install
   ```

3. Verlinke den Dokumentationsinhalt aus dem Hauptverzeichnis `docs`:

   ```bash
   npm run link
   ```

   Dadurch wird ein symbolischer Link von `../docs` nach `content` im docs-site-Projekt erstellt, sodass der Dokumentationsinhalt von der Next.js-Seite bereitgestellt werden kann.

4. Starte den Entwicklungsserver:

   ```bash
   npm run dev
   ```

5. Öffne [http://localhost:3000](http://localhost:3000) in deinem Browser, um die Dokumentationsseite mit Live-Updates zu sehen, während du Änderungen vornimmst.

Alle Änderungen an den Dokumentationsdateien im Hauptverzeichnis `docs` werden sofort auf der Dokumentationsseite sichtbar.

## Debugging

### VS Code:

0.  Führe die CLI aus, um interaktiv mit VS Code zu debuggen, indem du `F5` drückst.
1.  Starte die CLI im Debug-Modus aus dem Stammverzeichnis:
    ```bash
    npm run debug
    ```
    Dieser Befehl führt `node --inspect-brk dist/index.js` im Verzeichnis `packages/cli` aus und pausiert die Ausführung, bis ein Debugger verbunden wird. Du kannst dann `chrome://inspect` in deinem Chrome-Browser öffnen, um eine Verbindung zum Debugger herzustellen.
2.  Verwende in VS Code die Startkonfiguration "Attach" (zu finden in `.vscode/launch.json`).

Alternativ kannst du die Konfiguration "Launch Program" in VS Code verwenden, wenn du die aktuell geöffnete Datei direkt starten möchtest. In der Regel wird jedoch `F5` empfohlen.

Um einen Haltepunkt innerhalb des Sandbox-Containers zu erreichen, führe aus:

```bash
DEBUG=1 qwen-code
```

**Hinweis:** Wenn du `DEBUG=true` in einer `.env`-Datei eines Projekts hast, hat das aufgrund des automatischen Ausschlusses keine Auswirkungen auf qwen-code. Verwende `.qwen-code/.env`-Dateien für qwen-code-spezifische Debug-Einstellungen.

### React DevTools

Zum Debuggen der React-basierten Benutzeroberfläche der CLI kannst du React DevTools verwenden. Ink, die Bibliothek, die für die CLI-Oberfläche verwendet wird, ist mit React DevTools Version 4.x kompatibel.

1.  **Starte die Qwen Code-Anwendung im Entwicklungsmodus:**

    ```bash
    DEV=true npm start
    ```

2.  **Installiere und starte React DevTools Version 4.28.5 (oder die neueste kompatible 4.x-Version):**

    Du kannst sie global installieren:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Oder führe sie direkt mit npx aus:

    ```bash
    npx react-devtools@4.28.5
    ```

    Deine laufende CLI-Anwendung sollte sich dann mit React DevTools verbinden.

## Sandboxing

> TBD

## Manuelles Veröffentlichen

Wir veröffentlichen für jeden Commit ein Artefakt in unserem internen Repository. Wenn du jedoch manuell einen lokalen Build erstellen musst, führe bitte die folgenden Befehle aus:
```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
