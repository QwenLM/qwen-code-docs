# So kannst du beitragen

Wir freuen uns über Ihre Patches und Beiträge zu diesem Projekt.

## Beitragsprozess

### Code-Reviews

Alle Einreichungen, einschließlich der von Projektmitgliedern, erfordern eine Überprüfung. Wir verwenden dafür [GitHub Pull Requests](https://docs.github.com/articles/about-pull-requests).

### Richtlinien für Pull Requests

Um uns zu helfen, Ihre PRs schnell zu überprüfen und zusammenzuführen, befolgen Sie bitte diese Richtlinien. PRs, die diese Standards nicht erfüllen, können geschlossen werden.

#### 1. Verknüpfung mit einem bestehenden Issue

Alle PRs sollten mit einem bestehenden Issue in unserem Tracker verknüpft sein. Dies stellt sicher, dass jede Änderung besprochen wurde und mit den Zielen des Projekts übereinstimmt, bevor Code geschrieben wird.

- **Für Fehlerbehebungen:** Der PR sollte mit dem Issue des Fehlerberichts verknüpft sein.
- **Für Funktionen:** Der PR sollte mit dem Feature-Request oder Proposal-Issue verknüpft sein, das von einem Maintainer genehmigt wurde.

Falls für Ihre Änderung noch kein Issue existiert, **eröffnen Sie bitte zuerst eines** und warten Sie auf Rückmeldung, bevor Sie mit dem Codieren beginnen.

#### 2. Halten Sie es klein und fokussiert

Wir bevorzugen kleine, atomare PRs, die ein einzelnes Problem behandeln oder eine einzelne, in sich geschlossene Funktion hinzufügen.

- **Tun:** Erstellen Sie einen PR, der einen bestimmten Fehler behebt oder eine bestimmte Funktion hinzufügt.
- **Nicht:** Bündeln Sie mehrere unabhängige Änderungen (z.B. eine Fehlerbehebung, eine neue Funktion und eine Refaktorisierung) in einem einzigen PR.

Als Faustregel gilt: Teilen Sie einen PR auf, sobald er etwa 1.200 geänderte Zeilen überschreitet. PRs mit mehr als etwa 2.000 geänderten Zeilen sollten entweder in eine Reihe von kleineren, logischen PRs aufgeteilt werden, die unabhängig voneinander überprüft und zusammengeführt werden können, oder in der PR-Beschreibung erklären, warum die Änderung zusammen eingebracht werden muss.

#### 3. Verwenden Sie Draft-PRs für laufende Arbeiten

Wenn Sie frühzeitiges Feedback zu Ihrer Arbeit erhalten möchten, nutzen Sie bitte die **Draft Pull Request**-Funktion von GitHub. Dies signalisiert den Maintainern, dass der PR noch nicht für eine formelle Überprüfung bereit ist, aber für Diskussionen und erstes Feedback offen steht.

#### 4. Stellen Sie sicher, dass alle Prüfungen bestanden werden

Bevor Sie Ihren PR einreichen, stellen Sie sicher, dass alle automatisierten Prüfungen bestanden werden, indem Sie `npm run preflight` ausführen. Dieser Befehl führt alle Tests, Linting und andere Stilprüfungen aus.

#### 5. Aktualisieren Sie die Dokumentation

Wenn Ihr PR eine benutzersichtbare Änderung einführt (z.B. einen neuen Befehl, ein geändertes Flag oder eine Verhaltensänderung), müssen Sie auch die entsprechende Dokumentation im `/docs`-Verzeichnis aktualisieren.

#### 6. Schreiben Sie klare Commit-Nachrichten und eine gute PR-Beschreibung

Ihr PR sollte einen klaren, beschreibenden Titel und eine detaillierte Beschreibung der Änderungen haben. Folgen Sie dem [Conventional Commits](https://www.conventionalcommits.org/)-Standard für Ihre Commit-Nachrichten.

- **Guter PR-Titel:** `feat(cli): Add --json flag to 'config get' command`
- **Schlechter PR-Titel:** `Made some changes`

Erklären Sie in der PR-Beschreibung das „Warum“ hinter Ihren Änderungen und verlinken Sie auf das entsprechende Issue (z.B. `Fixes #123`).

## Entwicklungseinrichtung und Arbeitsablauf

Dieser Abschnitt führt Mitwirkende durch den Aufbau, die Änderung und das Verständnis der Entwicklungsumgebung dieses Projekts.

### Einrichten der Entwicklungsumgebung

**Voraussetzungen:**

1.  **Node.js**:
    - **Entwicklung:** Bitte verwenden Sie Node.js `>=22`. Ink 7 (vom TUI verwendet) erfordert Node 22, und `react@^19.2.0` ist der passende Peer. Sie können ein Tool wie [nvm](https://github.com/nvm-sh/nvm) zur Verwaltung von Node.js-Versionen nutzen.
    - **Produktion:** Für den Betrieb der CLI in einer Produktionsumgebung ist jede Node.js-Version `>=22` akzeptabel.
2.  **Git**

### Bauprozess

Um das Repository zu klonen:

```bash
git clone https://github.com/QwenLM/qwen-code.git # Or your fork's URL
cd qwen-code
```

Um die in `package.json` definierten Abhängigkeiten sowie die Root-Abhängigkeiten zu installieren:

```bash
npm install
```

Um das gesamte Projekt (alle Pakete) zu bauen:

```bash
npm run build
```

Dieser Befehl kompiliert in der Regel TypeScript zu JavaScript, bündelt Assets und bereitet die Pakete zur Ausführung vor. Weitere Details zum Build-Vorgang finden Sie in `scripts/build.js` und den Skripten in `package.json`.

### Aktivieren der Sandbox

[Sandboxing](#sandboxing) wird dringend empfohlen und erfordert mindestens das Setzen von `QWEN_SANDBOX=true` in Ihrer `~/.env` und die Sicherstellung, dass ein Sandboxing-Anbieter (z.B. `macOS Seatbelt`, `docker` oder `podman`) verfügbar ist. Details finden Sie unter [Sandboxing](#sandboxing).

Um sowohl das `qwen` CLI-Dienstprogramm als auch den Sandbox-Container zu bauen, führen Sie `build:all` aus dem Wurzelverzeichnis aus:

```bash
npm run build:all
```

Um den Bau des Sandbox-Containers zu überspringen, können Sie stattdessen `npm run build` verwenden.

### Ausführung

Um die Qwen Code-Anwendung aus dem Quellcode zu starten (nach dem Bau), führen Sie den folgenden Befehl aus dem Wurzelverzeichnis aus:

```bash
npm start
```

Wenn Sie den Quellbau außerhalb des qwen-code-Ordners ausführen möchten, können Sie `npm link path/to/qwen-code/packages/cli` (siehe: [Dokumentation](https://docs.npmjs.com/cli/v9/commands/npm-link)) verwenden, um es mit `qwen` auszuführen.

### Ausführen von Tests

Dieses Projekt enthält zwei Arten von Tests: Unit-Tests und Integrationstests.

#### Unit-Tests

Um die Unit-Test-Suite für das Projekt auszuführen:

```bash
npm run test
```

Dies führt Tests in den Verzeichnissen `packages/core` und `packages/cli` aus. Stellen Sie sicher, dass die Tests bestanden werden, bevor Sie Änderungen einreichen. Für eine umfassendere Überprüfung wird empfohlen, `npm run preflight` auszuführen.

#### Integrationstests

Die Integrationstests sind darauf ausgelegt, die End-to-End-Funktionalität von Qwen Code zu validieren. Sie werden nicht als Teil des standardmäßigen `npm run test`-Befehls ausgeführt.

Um die Integrationstests auszuführen, verwenden Sie den folgenden Befehl:

```bash
npm run test:e2e
```

Weitere detaillierte Informationen zum Framework für Integrationstests finden Sie in der [Dokumentation zu Integrationstests](./development/integration-tests.md).

### Linting und Preflight-Prüfungen

Um Codequalität und Formatierungskonsistenz sicherzustellen, führen Sie die Preflight-Prüfung aus:

```bash
npm run preflight
```

Dieser Befehl führt ESLint, Prettier, alle Tests und andere in der `package.json` des Projekts definierte Prüfungen aus.

_ProTip_

Erstellen Sie nach dem Klonen eine Git-Precommit-Hook-Datei, um sicherzustellen, dass Ihre Commits immer sauber sind.

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

Um den Code in diesem Projekt separat zu formatieren, führen Sie den folgenden Befehl aus dem Wurzelverzeichnis aus:

```bash
npm run format
```

Dieser Befehl verwendet Prettier, um den Code gemäß den Stilrichtlinien des Projekts zu formatieren.

#### Linting

Um den Code in diesem Projekt separat zu linten, führen Sie den folgenden Befehl aus dem Wurzelverzeichnis aus:

```bash
npm run lint
```

### Kodierkonventionen

- Bitte halten Sie sich an den Codestil, die Muster und Konventionen, die in der gesamten bestehenden Codebasis verwendet werden.
- **Imports:** Achten Sie besonders auf Importpfade. Das Projekt verwendet ESLint, um Einschränkungen für relative Imports zwischen Paketen durchzusetzen.

### Projektstruktur

- `packages/`: Enthält die einzelnen Unterpakete des Projekts.
  - `cli/`: Die Kommandozeilenschnittstelle.
  - `core/`: Die Kern-Backend-Logik für Qwen Code.
- `docs/`: Enthält die gesamte Projektdokumentation.
- `scripts/`: Dienstprogramme für Bau-, Test- und Entwicklungsaufgaben.

Weitere Details zur Architektur finden Sie in `docs/architecture.md`.

## Dokumentationsentwicklung

Dieser Abschnitt beschreibt, wie Sie die Dokumentation lokal entwickeln und in der Vorschau anzeigen können.

### Voraussetzungen

1. Stellen Sie sicher, dass Node.js (Version 22+) installiert ist.
2. Halten Sie npm oder yarn bereit.

### Dokumentationsseite lokal einrichten

Um an der Dokumentation zu arbeiten und Änderungen lokal in der Vorschau anzuzeigen:

1. Navigieren Sie in das Verzeichnis `docs-site`:

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

   Dies erstellt einen symbolischen Link von `../docs` nach `content` im docs-site-Projekt, sodass der Dokumentationsinhalt von der Next.js-Seite bereitgestellt werden kann.

4. Starten Sie den Entwicklungsserver:

   ```bash
   npm run dev
   ```

5. Öffnen Sie [http://localhost:3000](http://localhost:3000) in Ihrem Browser, um die Dokumentationsseite mit Live-Updates zu sehen, während Sie Änderungen vornehmen.

Alle Änderungen an den Dokumentationsdateien im Hauptverzeichnis `docs` werden sofort auf der Dokumentationsseite angezeigt.

## Debugging

### VS Code:

0.  Führen Sie die CLI aus, um interaktiv in VS Code mit `F5` zu debuggen.
1.  Starten Sie die CLI im Debug-Modus aus dem Wurzelverzeichnis:
    ```bash
    npm run debug
    ```
    Dieser Befehl führt `node --inspect-brk dist/index.js` im Verzeichnis `packages/cli` aus und pausiert die Ausführung, bis ein Debugger angehängt wird. Sie können dann `chrome://inspect` in Ihrem Chrome-Browser öffnen, um eine Verbindung zum Debugger herzustellen.
2.  Verwenden Sie in VS Code die Startkonfiguration "Attach" (zu finden in `.vscode/launch.json`).

Alternativ können Sie die Konfiguration "Launch Program" in VS Code verwenden, wenn Sie die aktuell geöffnete Datei direkt starten möchten, aber 'F5' wird generell empfohlen.

Um einen Haltepunkt im Sandbox-Container zu setzen, führen Sie aus:

```bash
DEBUG=1 qwen
```

**Hinweis:** Wenn Sie `DEBUG=true` in einer `.env`-Datei des Projekts haben, wirkt sich dies aufgrund des automatischen Ausschlusses nicht auf `qwen` aus. Verwenden Sie `.qwen/.env`-Dateien für `qwen`-spezifische Debug-Einstellungen.

### React DevTools

Um die React-basierte Benutzeroberfläche der CLI zu debuggen, können Sie React DevTools verwenden. Ink, die für die CLI-Oberfläche verwendete Bibliothek, ist mit React DevTools Version 4.x kompatibel.

1.  **Starten Sie die Qwen Code-Anwendung im Entwicklungsmodus:**

    ```bash
    DEV=true npm start
    ```

2.  **Installieren und führen Sie React DevTools Version 4.28.5 (oder die neueste kompatible 4.x-Version) aus:**

    Sie können es entweder global installieren:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Oder führen Sie es direkt mit npx aus:

    ```bash
    npx react-devtools@4.28.5
    ```

    Ihre laufende CLI-Anwendung sollte sich dann mit React DevTools verbinden.

## Sandboxing

> TBD

## Manuelle Veröffentlichung

Wir veröffentlichen für jeden Commit ein Artefakt in unserem internen Registry. Wenn Sie jedoch manuell einen lokalen Build erstellen müssen, führen Sie die folgenden Befehle aus:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```