# Package-Übersicht

Dieses Monorepo enthält zwei Hauptpakete: `@qwen-code/qwen-code` und `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Dies ist das Hauptpaket für Qwen Code. Es ist verantwortlich für die Benutzeroberfläche, das Parsen von Commands und alle anderen benutzerseitigen Funktionen.

Wenn dieses Paket veröffentlicht wird, wird es in eine einzelne ausführbare Datei gebündelt. Dieses Bundle enthält alle Abhängigkeiten des Pakets, einschließlich `@qwen-code/qwen-code-core`. Das bedeutet, egal ob ein Nutzer das Paket mit `npm install -g @qwen-code/qwen-code` installiert oder es direkt mit `npx @qwen-code/qwen-code` ausführt – er verwendet diese eine eigenständige, ausführbare Datei.

## `@qwen-code/qwen-code-core`

Dieses Package enthält die Kernlogik für die CLI. Es ist verantwortlich für das Senden von API-Anfragen an konfigurierte Provider, die Authentifizierung und das Management des lokalen Caches.

Dieses Package wird nicht gebundled. Bei der Veröffentlichung wird es als normales Node.js Package mit seinen eigenen Abhängigkeiten veröffentlicht. Dadurch kann es bei Bedarf als eigenständiges Package in anderen Projekten verwendet werden. Der gesamte transpilierte JavaScript-Code im `dist`-Ordner ist im Package enthalten.

# Release-Prozess

Dieses Projekt folgt einem strukturierten Release-Prozess, um sicherzustellen, dass alle Packages korrekt versioniert und veröffentlicht werden. Der Prozess ist so weit wie möglich automatisiert.

## Wie man einen Release durchführt

Releases werden über den [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions Workflow verwaltet. Um einen manuellen Release für einen Patch oder Hotfix durchzuführen:

1.  Gehe zum **Actions**-Tab des Repositories.
2.  Wähle den **Release**-Workflow aus der Liste aus.
3.  Klicke auf den Dropdown-Button **Run workflow**.
4.  Fülle die erforderlichen Eingaben aus:
    - **Version**: Die exakte Version, die released werden soll (z. B. `v0.2.1`).
    - **Ref**: Der Branch oder Commit-SHA, von dem aus der Release erfolgen soll (standardmäßig `main`).
    - **Dry Run**: Auf `true` belassen, um den Workflow zu testen, ohne ihn zu veröffentlichen, oder auf `false` setzen, um einen echten Release durchzuführen.
5.  Klicke auf **Run workflow**.

## Nightly Releases

Zusätzlich zu manuellen Releases verfügt dieses Projekt über einen automatisierten Nightly-Release-Prozess, um die neueste "bleeding edge"-Version zum Testen und Entwickeln bereitzustellen.

### Prozess

Jede Nacht um Mitternacht UTC wird der [Release-Workflow](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) automatisch nach Zeitplan ausgeführt. Er führt folgende Schritte durch:

1.  Checkt den neuesten Code aus dem `main` Branch aus.
2.  Installiert alle Abhängigkeiten.
3.  Führt die komplette Suite an `preflight` Checks und Integrationstests aus.
4.  Falls alle Tests erfolgreich sind, wird die nächste Nightly-Version berechnet (z. B. `v0.2.1-nightly.20230101`).
5.  Anschließend werden die Pakete gebaut und mit dem `nightly` dist-tag auf npm veröffentlicht.
6.  Abschließend wird ein GitHub Release für die Nightly-Version erstellt.

### Fehlerbehandlung

Falls ein Schritt im Nightly-Workflow fehlschlägt, wird automatisch ein neues Issue im Repository erstellt, gekennzeichnet mit den Labels `bug` und `nightly-failure`. Das Issue enthält einen Link zum fehlgeschlagenen Workflow-Lauf zur einfachen Fehlersuche.

### Wie man den Nightly Build verwendet

Um den neuesten Nightly Build zu installieren, verwende den `@nightly` Tag:

```bash
npm install -g @qwen-code/qwen-code@nightly
```

Wir führen außerdem einen Google Cloud Build namens [release-docker.yml](../.gcp/release-docker.yaml) aus, der das Sandbox-Docker Image entsprechend deinem Release veröffentlicht. Sobald die Service Account Berechtigungen geklärt sind, wird dies ebenfalls auf GH verschoben und mit der Haupt-Release-Datei zusammengeführt.

### Nach dem Release

Sobald der Workflow erfolgreich abgeschlossen ist, kannst du den Fortschritt im [GitHub Actions Tab](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) verfolgen. Wenn er fertig ist, solltest du:

1.  Zur [Pull Requests Seite](https://github.com/QwenLM/qwen-code/pulls) des Repositories navigieren.
2.  Einen neuen Pull Request vom `release/vX.Y.Z` Branch in den `main` Branch erstellen.
3.  Den Pull Request reviewen (er sollte nur Versionsaktualisierungen in den `package.json` Dateien enthalten) und mergen. Dadurch bleibt die Version im `main` Branch aktuell.

## Release-Validierung

Nach dem Push eines neuen Releases sollte ein Smoke-Test durchgeführt werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Dies kann durch eine lokale Installation der Pakete und das Ausführen einer Reihe von Tests erfolgen, um ihre ordnungsgemäße Funktionsweise zu überprüfen.

- `npx -y @qwen-code/qwen-code@latest --version`, um zu validieren, dass der Push wie erwartet funktioniert hat, wenn kein RC- oder Dev-Tag verwendet wurde
- `npx -y @qwen-code/qwen-code@<release tag> --version`, um zu überprüfen, ob der Tag korrekt gepusht wurde
- _Dies ist lokal destruktiv_: `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- Ein Smoke-Test mit einer grundlegenden Ausführung einiger LLM-Befehle und Tools wird empfohlen, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Wir werden dies in Zukunft weiter formalisieren.

## Wann soll das Version-Update gemerged werden – oder nicht?

Das oben beschriebene Muster zum Erstellen von Patch- oder Hotfix-Releases von aktuellen oder älteren Commits aus führt dazu, dass sich das Repository in folgendem Zustand befindet:

1.  Der Tag (`vX.Y.Z-patch.1`): Dieser Tag zeigt korrekterweise auf den ursprünglichen Commit im main-Branch, der den stabilen Code enthält, den du veröffentlichen wolltest. Das ist entscheidend. Jeder, der diesen Tag auscheckt, erhält exakt den Code, der veröffentlicht wurde.
2.  Der Branch (`release-vX.Y.Z-patch.1`): Dieser Branch enthält einen neuen Commit über dem getaggten Commit. Dieser neue Commit enthält ausschließlich die Versionsnummer-Änderung in der `package.json` (und anderen zugehörigen Dateien wie `package-lock.json`).

Diese Trennung ist gut. Sie hält den Verlauf deines main-Branch sauber von Release-spezifischen Versionsanpassungen, bis du dich entscheidest, diese zu mergen.

Das ist die entscheidende Frage, und sie hängt vollständig von der Art des Releases ab.

### Merge Back für Stable Patches und Hotfixes

In den meisten Fällen solltest du den `release-<tag>` Branch zurück in `main` mergen, sobald du einen Stable Patch oder Hotfix releast.

- Warum? Der Hauptgrund ist, dass die Version in der package.json des main Branches aktualisiert werden muss. Wenn du z. B. v1.2.1 von einem älteren Commit releast, aber den Versionsbump nie zurückmerge, wird deine package.json im main Branch weiterhin `"version": "1.2.0"` anzeigen. Der nächste Entwickler, der mit der Arbeit an der nächsten Feature-Release (z. B. v1.3.0) beginnt, wird von einer Codebasis ausgehen, die eine falsche, veraltete Versionsnummer enthält. Das führt zu Verwirrung und erfordert später manuelles Anpassen der Versionsnummer.
- Der Prozess: Nachdem der release-v1.2.1 Branch erstellt und das Paket erfolgreich veröffentlicht wurde, solltest du einen Pull Request öffnen, um release-v1.2.1 in main zu mergen. Dieser PR enthält nur einen einzigen Commit: `"chore: bump version to v1.2.1"`. Es ist eine saubere und einfache Integration, die deinen main Branch mit der zuletzt releasten Version synchron hält.

### NICHT Zurückführen für Pre-Releases (RC, Beta, Dev)

Release Branches für Pre-Releases werden in der Regel nicht zurück in `main` gemerged.

- Warum? Pre-Release-Versionen (z. B. v1.3.0-rc.1, v1.3.0-rc.2) sind definitionsgemäß nicht stabil und nur temporär. Du willst den Verlauf deines main-Branches nicht mit einer Reihe von Versionsanpassungen für Release Candidates verschmutzen. Die package.json in main sollte die neueste stabile Release-Version widerspiegeln, nicht einen RC.
- Der Prozess: Der release-v1.3.0-rc.1-Branch wird erstellt, der Befehl `npm publish --tag rc` wird ausgeführt, und danach hat der Branch seinen Zweck erfüllt. Du kannst ihn einfach löschen. Der Code für den RC ist bereits in main (oder einem Feature-Branch) enthalten, sodass kein funktionaler Code verloren geht. Der Release-Branch war nur ein temporäres Transportmittel für die Versionsnummer.

## Lokales Testen und Validierung: Änderungen am Packaging- und Publishing-Prozess

Wenn du den Release-Prozess testen musst, ohne tatsächlich auf NPM zu veröffentlichen oder ein öffentliches GitHub-Release zu erstellen, kannst du den Workflow manuell über die GitHub UI auslösen.

1. Gehe zum [Actions-Tab](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) des Repositories.
2. Klicke auf das Dropdown-Menü „Run workflow“.
3. Lass die Option `dry_run` aktiviert (`true`).
4. Klicke auf den Button „Run workflow“.

Dadurch wird der gesamte Release-Prozess ausgeführt, jedoch werden die Schritte `npm publish` und `gh release create` übersprungen. Du kannst die Workflow-Logs einsehen, um sicherzustellen, dass alles wie erwartet funktioniert.

Es ist entscheidend, Änderungen am Packaging- und Publishing-Prozess lokal zu testen, bevor du sie committest. Dadurch wird sichergestellt, dass die Pakete korrekt veröffentlicht werden und wie erwartet funktionieren, wenn sie von einem Benutzer installiert werden.

Um deine Änderungen zu validieren, kannst du einen Dry-Run des Publishing-Prozesses durchführen. Dies simuliert den Publishing-Prozess, ohne tatsächlich Pakete im npm-Registry zu veröffentlichen.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Dieser Befehl führt folgende Schritte aus:

1. Erstellt alle Pakete.
2. Führt alle Prepublish-Skripte aus.
3. Erstellt die `.tgz`-Tarballs, die auf npm veröffentlicht würden.
4. Gibt eine Zusammenfassung der Pakete aus, die veröffentlicht werden würden.

Du kannst dann die generierten Tarballs überprüfen, um sicherzustellen, dass sie die korrekten Dateien enthalten und dass die `package.json`-Dateien korrekt aktualisiert wurden. Die Tarballs werden im Root-Verzeichnis jedes Pakets erstellt (z. B. `packages/cli/google-gemini-cli-0.1.6.tgz`).

Durch einen Dry-Run kannst du sicherstellen, dass deine Änderungen am Packaging-Prozess korrekt sind und dass die Pakete erfolgreich veröffentlicht werden.

## Release Deep Dive

Das Hauptziel des Release-Prozesses ist es, den Source Code aus dem `packages/`-Verzeichnis zu nehmen, zu bauen und ein sauberes, eigenständiges Paket in einem temporären `bundle`-Verzeichnis im Root des Projekts zusammenzustellen. Dieses `bundle`-Verzeichnis ist es, was letztendlich auf NPM veröffentlicht wird.

Hier sind die wichtigsten Stufen:

### Stufe 1: Pre-Release Sanity Checks und Versionierung

- **Was passiert**: Bevor Dateien verschoben werden, stellt der Prozess sicher, dass sich das Projekt in einem guten Zustand befindet. Dazu gehören das Ausführen von Tests, Linting und Type-Checking (`npm run preflight`). Die Versionsnummer in der root `package.json` und `packages/cli/package.json` wird auf die neue Release-Version aktualisiert.
- **Warum**: Dadurch wird sichergestellt, dass nur hochwertiger, funktionierender Code veröffentlicht wird. Die Versionierung ist der erste Schritt, um ein neues Release zu kennzeichnen.

### Stufe 2: Build des Source Codes

- **Was passiert**: Der TypeScript-Code in `packages/core/src` und `packages/cli/src` wird in JavaScript kompiliert.
- **Dateibewegung**:
  - `packages/core/src/**/*.ts` → kompiliert zu → `packages/core/dist/`
  - `packages/cli/src/**/*.ts` → kompiliert zu → `packages/cli/dist/`
- **Warum**: Der TypeScript-Code, der während der Entwicklung geschrieben wurde, muss in reines JavaScript umgewandelt werden, das von Node.js ausgeführt werden kann. Das Core-Package wird zuerst gebaut, da das CLI-Package davon abhängt.

### Stufe 3: Zusammenstellung des finalen, veröffentlichbaren Pakets

Dies ist die kritischste Stufe, in der Dateien in ihren finalen Zustand für die Veröffentlichung verschoben und transformiert werden. Ein temporäres `bundle`-Verzeichnis wird im Projekt-Root erstellt, um den finalen Paketinhalt aufzunehmen.

#### 1. Transformation der `package.json`

- **Was passiert**: Die `package.json` aus `packages/cli/` wird eingelesen, modifiziert und in das Root-`bundle`/-Verzeichnis geschrieben.
- **Dateibewegung**: `packages/cli/package.json` → (In-Memory-Transformation) → `bundle/package.json`
- **Warum**: Die finale `package.json` muss sich von der unterscheiden, die während der Entwicklung verwendet wird. Wichtige Änderungen sind:
  - Entfernen von `devDependencies`.
  - Entfernen von workspace-spezifischen `"dependencies": { "@gemini-cli/core": "workspace:*" }` und Sicherstellen, dass der Core-Code direkt in die finale JavaScript-Datei gebundled wird.
  - Sicherstellen, dass die Felder `bin`, `main` und `files` auf die korrekten Pfade innerhalb der finalen Paketstruktur zeigen.

#### 2. Erstellung des JavaScript-Bundles

- **Was passiert**: Der gebaute JavaScript-Code aus `packages/core/dist` und `packages/cli/dist` wird in eine einzelne, ausführbare JavaScript-Datei gebundled.
- **Dateibewegung**: `packages/cli/dist/index.js` + `packages/core/dist/index.js` → (gebundled durch esbuild) → `bundle/gemini.js` (oder ähnlicher Name).
- **Warum**: Dies erzeugt eine einzelne, optimierte Datei, die den gesamten notwendigen Anwendungscode enthält. Es vereinfacht das Paket, da das Core-Package nicht mehr als separate Dependency auf NPM benötigt wird – sein Code ist jetzt direkt enthalten.

#### 3. Kopieren statischer und unterstützender Dateien

- **Was passiert**: Wesentliche Dateien, die nicht Teil des Source Codes sind, aber für das korrekte Funktionieren oder die Beschreibung des Pakets benötigt werden, werden in das `bundle`-Verzeichnis kopiert.
- **Dateibewegung**:
  - `README.md` → `bundle/README.md`
  - `LICENSE` → `bundle/LICENSE`
  - `packages/cli/src/utils/*.sb` (Sandbox-Profile) → `bundle/`
- **Warum**:
  - `README.md` und `LICENSE` sind Standarddateien, die in jedem NPM-Paket enthalten sein sollten.
  - Die Sandbox-Profile (`.sb`-Dateien) sind kritische Laufzeit-Assets, die für die Sandbox-Funktion des CLI erforderlich sind. Sie müssen sich direkt neben der finalen ausführbaren Datei befinden.

### Stufe 4: Veröffentlichen auf NPM

- **Was passiert**: Der Befehl `npm publish` wird aus dem Root-`bundle`-Verzeichnis heraus ausgeführt.
- **Warum**: Durch das Ausführen von `npm publish` aus dem `bundle`-Verzeichnis werden nur die Dateien hochgeladen, die wir sorgfältig in Stufe 3 zusammengestellt haben. Dadurch wird verhindert, dass versehentlich Source Code, Testdateien oder Entwicklungskonfigurationen veröffentlicht werden – das Ergebnis ist ein sauberes und minimales Paket für die Nutzer.

### Zusammenfassung des Dateiflusses

```mermaid
graph TD
    subgraph "Source Files"
        A["packages/core/src/*.ts<br/>packages/cli/src/*.ts"]
        B["packages/cli/package.json"]
        C["README.md<br/>LICENSE<br/>packages/cli/src/utils/*.sb"]
    end

    subgraph "Process"
        D(Build)
        E(Transform)
        F(Assemble)
        G(Publish)
    end

    subgraph "Artifacts"
        H["Bundled JS"]
        I["Final package.json"]
        J["bundle/"]
    end

    subgraph "Destination"
        K["NPM Registry"]
    end

    A --> D --> H
    B --> E --> I
    C --> F
    H --> F
    I --> F
    F --> J
    J --> G --> K
```

Dieser Prozess stellt sicher, dass das letztendlich veröffentlichte Artefakt eine gezielt erstellte, saubere und effiziente Darstellung des Projekts ist – und nicht einfach eine direkte Kopie des Entwicklungsumfelds.

## NPM Workspaces

Dieses Projekt verwendet [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces), um die Pakete innerhalb dieses Monorepos zu verwalten. Dies vereinfacht die Entwicklung, da wir Abhängigkeiten verwalten und Skripte über mehrere Pakete hinweg vom Root des Projekts aus ausführen können.

### Funktionsweise

Die root `package.json` Datei definiert die Workspaces für dieses Projekt:

```json
{
  "workspaces": ["packages/*"]
}
```

Dies teilt NPM mit, dass jeder Ordner innerhalb des `packages` Verzeichnisses ein separates Paket ist, das als Teil des Workspaces verwaltet werden sollte.

### Vorteile von Workspaces

- **Vereinfachte Dependency-Management**: Wenn du `npm install` vom Root des Projekts ausführst, werden alle Abhängigkeiten für alle Pakete im Workspace installiert und miteinander verknüpft. Das bedeutet, dass du nicht in jedem Paket-Verzeichnis `npm install` ausführen musst.
- **Automatische Verknüpfung**: Pakete innerhalb des Workspaces können voneinander abhängen. Beim Ausführen von `npm install` erstellt NPM automatisch Symlinks zwischen den Paketen. Das heißt, wenn du Änderungen an einem Paket vornimmst, sind diese sofort in anderen Paketen verfügbar, die davon abhängen.
- **Vereinfachte Skriptausführung**: Du kannst Skripte in jedem Paket vom Root des Projekts aus mit dem `--workspace`-Flag ausführen. Um beispielsweise das `build`-Skript im `cli`-Paket auszuführen, kannst du `npm run build --workspace @google/gemini-cli` verwenden.