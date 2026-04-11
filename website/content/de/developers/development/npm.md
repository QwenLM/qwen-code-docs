# Paketübersicht

Dieses Monorepo enthält zwei Hauptpakete: `@qwen-code/qwen-code` und `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Dies ist das Hauptpaket für Qwen Code. Es ist für die Benutzeroberfläche, das Parsen von Befehlen und alle anderen nutzerorientierten Funktionen verantwortlich.

Beim Veröffentlichen wird dieses Paket zu einer einzigen ausführbaren Datei gebündelt. Dieses Bundle enthält alle Abhängigkeiten des Pakets, einschließlich `@qwen-code/qwen-code-core`. Das bedeutet, dass Nutzer unabhängig davon, ob sie das Paket mit `npm install -g @qwen-code/qwen-code` installieren oder direkt mit `npx @qwen-code/qwen-code` ausführen, diese einzelne, in sich geschlossene ausführbare Datei verwenden.

## `@qwen-code/qwen-code-core`

Dieses Paket enthält die Kernlogik für die CLI. Es ist für das Senden von API-Anfragen an konfigurierte Provider, die Authentifizierung und die Verwaltung des lokalen Caches verantwortlich.

Dieses Paket wird nicht gebündelt. Bei der Veröffentlichung wird es als standardmäßiges Node.js-Paket mit eigenen Abhängigkeiten veröffentlicht. Dadurch kann es bei Bedarf als eigenständiges Paket in anderen Projekten verwendet werden. Der gesamte transpilierte JS-Code im `dist`-Ordner ist im Paket enthalten.

# Release-Prozess

Dieses Projekt folgt einem strukturierten Release-Prozess, um sicherzustellen, dass alle Pakete korrekt versioniert und veröffentlicht werden. Der Prozess ist so weit wie möglich automatisiert.

## Release durchführen

Releases werden über den GitHub-Actions-Workflow [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) verwaltet. Um ein manuelles Release für einen Patch oder Hotfix durchzuführen:

1.  Navigiere zum Tab **Actions** des Repositories.
2.  Wähle den Workflow **Release** aus der Liste aus.
3.  Klicke auf die Dropdown-Schaltfläche **Run workflow**.
4.  Fülle die erforderlichen Eingabefelder aus:
    - **Version**: Die exakte Version, die veröffentlicht werden soll (z. B. `v0.2.1`).
    - **Ref**: Der Branch oder Commit-SHA, von dem aus das Release erstellt werden soll (Standard: `main`).
    - **Dry Run**: Lasse den Wert auf `true`, um den Workflow ohne Veröffentlichung zu testen, oder setze ihn auf `false`, um ein Live-Release durchzuführen.
5.  Klicke auf **Run workflow**.

## Release-Typen

Das Projekt unterstützt mehrere Release-Typen:

### Stabile Releases

Regelmäßige stabile Releases für den Produktiveinsatz.

### Preview Releases

Wöchentliche Preview-Releases jeden Dienstag um 23:59 UTC für frühen Zugriff auf kommende Features.

### Nightly Releases

Tägliche Nightly-Releases um Mitternacht UTC für Tests mit dem neuesten Entwicklungsstand.

## Automatisierter Release-Zeitplan

- **Nightly**: Täglich um Mitternacht UTC
- **Preview**: Jeden Dienstag um 23:59 UTC
- **Stable**: Manuelle Releases, die von Maintainern ausgelöst werden

### So verwendest du verschiedene Release-Typen

Um die neueste Version jedes Typs zu installieren:

```bash
# Stable (default)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Details zum Release-Prozess

Jedes geplante oder manuelle Release durchläuft folgende Schritte:

1.  Checkt den angegebenen Code aus (neuester Stand des `main`-Branches oder ein spezifischer Commit).
2.  Installiert alle Abhängigkeiten.
3.  Führt die vollständige Suite der `preflight`-Prüfungen und Integrationstests aus.
4.  Wenn alle Tests erfolgreich sind, wird die passende Versionsnummer basierend auf dem Release-Typ berechnet.
5.  Baut die Pakete und veröffentlicht sie mit dem passenden Dist-Tag auf npm.
6.  Erstellt ein GitHub Release für die Version.

### Fehlerbehandlung

Wenn ein Schritt im Release-Workflow fehlschlägt, wird automatisch ein neues Issue im Repository mit den Labels `bug` und einem typspezifischen Fehler-Label (z. B. `nightly-failure`, `preview-failure`) erstellt. Das Issue enthält einen Link zum fehlgeschlagenen Workflow-Run, um das Debugging zu erleichtern.

## Release-Validierung

Nach dem Pushen eines neuen Releases sollte ein Smoke-Test durchgeführt werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Dazu können die Pakete lokal installiert und eine Reihe von Tests ausgeführt werden, um die korrekte Funktionsweise zu überprüfen.

- `npx -y @qwen-code/qwen-code@latest --version` um zu validieren, dass der Push wie erwartet funktioniert hat (sofern kein `rc`- oder `dev`-Tag verwendet wurde)
- `npx -y @qwen-code/qwen-code@<release tag> --version` um zu validieren, dass das Tag korrekt gepusht wurde
- _Dieser Vorgang ist lokal destruktiv_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force &&  npm install @qwen-code/qwen-code@<version>`
- Es wird empfohlen, einen grundlegenden Smoke-Test durchzuführen, bei dem einige LLM-Befehle und Tools ausgeführt werden, um die erwartete Funktionsweise der Pakete zu bestätigen. Dies wird in Zukunft weiter formalisiert.

## Wann die Versionsänderung gemerged werden sollte (oder nicht)

Das oben beschriebene Vorgehen zum Erstellen von Patch- oder Hotfix-Releases aus aktuellen oder älteren Commits hinterlässt das Repository in folgendem Zustand:

1.  Das Tag (`vX.Y.Z-patch.1`): Dieses Tag zeigt korrekt auf den ursprünglichen Commit auf `main`, der den stabilen Code enthält, den du veröffentlichen wolltest. Das ist entscheidend. Jeder, der dieses Tag auscheckt, erhält exakt den Code, der veröffentlicht wurde.
2.  Der Branch (`release-vX.Y.Z-patch.1`): Dieser Branch enthält einen neuen Commit zusätzlich zum getaggten Commit. Dieser neue Commit enthält nur die Änderung der Versionsnummer in der `package.json` (und anderen zugehörigen Dateien wie `package-lock.json`).

Diese Trennung ist sinnvoll. Sie hält den Verlauf deines `main`-Branches frei von release-spezifischen Version-Bumps, bis du dich entscheidest, sie zu mergen.

Dies ist die entscheidende Frage und hängt vollständig von der Art des Releases ab.

### Zurückmergen für stabile Patches und Hotfixes

Für stabile Patch- oder Hotfix-Releases solltest du den `release-<tag>`-Branch fast immer zurück in `main` mergen.

- Warum? Der Hauptgrund ist die Aktualisierung der Version in der `package.json` von `main`. Wenn du v1.2.1 von einem älteren Commit veröffentlichst, aber den Version-Bump nie zurückmergst, steht in der `package.json` des `main`-Branches weiterhin `"version": "1.2.0"`. Der nächste Entwickler, der mit der Arbeit am nächsten Feature-Release (v1.3.0) beginnt, brancht von einer Codebasis mit einer falschen, älteren Versionsnummer. Das führt zu Verwirrung und erfordert später ein manuelles Version-Bumping.
- Der Prozess: Nachdem der Branch `release-v1.2.1` erstellt und das Paket erfolgreich veröffentlicht wurde, solltest du einen Pull Request öffnen, um `release-v1.2.1` in `main` zu mergen. Dieser PR enthält nur einen Commit: `chore: bump version to v1.2.1`. Es ist eine saubere, einfache Integration, die deinen `main`-Branch mit der neuesten veröffentlichten Version synchron hält.

### NICHT zurückmergen für Pre-Releases (RC, Beta, Dev)

Release-Branches für Pre-Releases werden in der Regel nicht zurück in `main` gemerged.

- Warum? Pre-Release-Versionen (z. B. v1.3.0-rc.1, v1.3.0-rc.2) sind per Definition nicht stabil und nur temporär. Du möchtest den Verlauf deines `main`-Branches nicht mit einer Reihe von Version-Bumps für Release Candidates verschmutzen. Die `package.json` in `main` sollte die neueste stabile Release-Version widerspiegeln, nicht eine RC.
- Der Prozess: Der Branch `release-v1.3.0-rc.1` wird erstellt, `npm publish --tag rc` wird ausgeführt und dann... hat der Branch seinen Zweck erfüllt. Du kannst ihn einfach löschen. Der Code für die RC befindet sich bereits auf `main` (oder einem Feature-Branch), es geht also kein funktionaler Code verloren. Der Release-Branch diente lediglich als temporäres Vehikel für die Versionsnummer.

## Lokales Testen und Validieren: Änderungen am Packaging- und Publishing-Prozess

Wenn du den Release-Prozess testen musst, ohne tatsächlich auf NPM zu veröffentlichen oder ein öffentliches GitHub Release zu erstellen, kannst du den Workflow manuell über die GitHub-UI auslösen.

1.  Gehe zum [Actions-Tab](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) des Repositories.
2.  Klicke auf das Dropdown-Menü "Run workflow".
3.  Lasse die Option `dry_run` aktiviert (`true`).
4.  Klicke auf die Schaltfläche "Run workflow".

Dadurch wird der gesamte Release-Prozess ausgeführt, aber die Schritte `npm publish` und `gh release create` werden übersprungen. Du kannst die Workflow-Logs einsehen, um sicherzustellen, dass alles wie erwartet funktioniert.

Es ist entscheidend, Änderungen am Packaging- und Publishing-Prozess vor dem Commit lokal zu testen. Dies stellt sicher, dass die Pakete korrekt veröffentlicht werden und nach der Installation durch Nutzer wie erwartet funktionieren.

Um deine Änderungen zu validieren, kannst du einen Dry Run des Publishing-Prozesses durchführen. Dies simuliert den Veröffentlichungsprozess, ohne die Pakete tatsächlich in der npm-Registry zu veröffentlichen.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Dieser Befehl führt Folgendes aus:

1.  Er baut alle Pakete.
2.  Er führt alle Prepublish-Skripte aus.
3.  Er erstellt die Paket-Tarballs, die auf npm veröffentlicht würden.
4.  Er gibt eine Zusammenfassung der Pakete aus, die veröffentlicht würden.

Anschließend kannst du die generierten Tarballs überprüfen, um sicherzustellen, dass sie die korrekten Dateien enthalten und die `package.json`-Dateien richtig aktualisiert wurden. Die Tarballs werden im Root-Verzeichnis jedes Pakets erstellt (z. B. `packages/cli/qwen-code-0.1.6.tgz`).

Durch einen Dry Run kannst du sicherstellen, dass deine Änderungen am Packaging-Prozess korrekt sind und die Pakete erfolgreich veröffentlicht werden.

## Release im Detail

Das Hauptziel des Release-Prozesses ist es, den Quellcode aus dem `packages/`-Verzeichnis zu nehmen, ihn zu bauen und ein sauberes, in sich geschlossenes Paket in einem temporären `dist`-Verzeichnis im Projekt-Root zusammenzustellen. Dieses `dist`-Verzeichnis ist das, was tatsächlich auf NPM veröffentlicht wird.

Hier sind die wichtigsten Phasen:

Phase 1: Pre-Release-Sanity-Checks und Versionierung

- Was passiert: Bevor Dateien verschoben werden, stellt der Prozess sicher, dass sich das Projekt in einem guten Zustand befindet. Dazu gehören das Ausführen von Tests, Linting und Type-Checking (`npm run preflight`). Die Versionsnummer in der `package.json` im Root und in `packages/cli/package.json` wird auf die neue Release-Version aktualisiert.
- Warum: Dies garantiert, dass nur hochwertiger, funktionierender Code veröffentlicht wird. Die Versionierung ist der erste Schritt, um ein neues Release zu kennzeichnen.

Phase 2: Bauen des Quellcodes

- Was passiert: Der TypeScript-Quellcode in `packages/core/src` und `packages/cli/src` wird in JavaScript kompiliert.
- Dateiverschiebung:
  - packages/core/src/\*_/_.ts -> kompiliert zu -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> kompiliert zu -> packages/cli/dist/
- Warum: Der während der Entwicklung geschriebene TypeScript-Code muss in reines JavaScript umgewandelt werden, das von Node.js ausgeführt werden kann. Das Core-Paket wird zuerst gebaut, da das CLI-Paket davon abhängt.

Phase 3: Bündeln und Zusammenstellen des finalen veröffentlichbaren Pakets

Dies ist die kritischste Phase, in der Dateien verschoben und in ihren finalen Zustand für die Veröffentlichung transformiert werden. Der Prozess nutzt moderne Bundling-Techniken, um das finale Paket zu erstellen.

1.  Bundle-Erstellung:
    - Was passiert: Das Skript `prepare-package.js` erstellt ein sauberes Distributionspaket im `dist`-Verzeichnis.
    - Wichtige Transformationen:
      - Kopiert `README.md` und `LICENSE` nach `dist/`
      - Kopiert den `locales`-Ordner für die Internationalisierung
      - Erstellt eine saubere `package.json` für die Distribution mit nur den notwendigen Abhängigkeiten
      - Hält die Distributionsabhängigkeiten minimal (keine gebündelten Runtime-Abhängigkeiten)
      - Behält optionale Abhängigkeiten für `node-pty` bei

2.  Das JavaScript-Bundle wird erstellt:
    - Was passiert: Das gebaute JavaScript aus `packages/core/dist` und `packages/cli/dist` wird mit esbuild zu einer einzigen, ausführbaren JavaScript-Datei gebündelt.
    - Dateipfad: dist/cli.js
    - Warum: Dies erzeugt eine einzelne, optimierte Datei, die den gesamten notwendigen Anwendungscode enthält. Sie vereinfacht das Paket, indem sie den Bedarf an komplexer Dependency-Auflösung zur Installationszeit entfernt.

3.  Statische und unterstützende Dateien werden kopiert:
    - Was passiert: Wesentliche Dateien, die nicht Teil des Quellcodes sind, aber für die korrekte Funktion oder Beschreibung des Pakets benötigt werden, werden in das `dist`-Verzeichnis kopiert.
    - Dateiverschiebung:
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Vendor-Dateien -> dist/vendor/
    - Warum:
      - `README.md` und `LICENSE` sind Standarddateien, die in jedem NPM-Paket enthalten sein sollten.
      - Locales unterstützen Internationalisierungsfunktionen
      - Vendor-Dateien enthalten notwendige Runtime-Abhängigkeiten

Phase 4: Veröffentlichung auf NPM

- Was passiert: Der Befehl `npm publish` wird aus dem Root-`dist`-Verzeichnis heraus ausgeführt.
- Warum: Durch das Ausführen von `npm publish` innerhalb des `dist`-Verzeichnisses werden nur die Dateien, die wir in Phase 3 sorgfältig zusammengestellt haben, in die NPM-Registry hochgeladen. Dies verhindert, dass versehentlich Quellcode, Testdateien oder Entwicklungskonfigurationen veröffentlicht werden, was zu einem sauberen und minimalen Paket für Nutzer führt.

Dieser Prozess stellt sicher, dass das final veröffentlichte Artefakt eine maßgeschneiderte, saubere und effiziente Repräsentation des Projekts ist, anstatt eine direkte Kopie des Development-Workspaces.

## NPM Workspaces

Dieses Projekt verwendet [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces), um die Pakete innerhalb dieses Monorepos zu verwalten. Dies vereinfacht die Entwicklung, indem es uns ermöglicht, Abhängigkeiten zu verwalten und Skripte über mehrere Pakete hinweg vom Projekt-Root aus auszuführen.

### So funktioniert es

Die `package.json` im Root definiert die Workspaces für dieses Projekt:

```json
{
  "workspaces": ["packages/*"]
}
```

Dies teilt NPM mit, dass jeder Ordner innerhalb des `packages`-Verzeichnisses ein separates Paket ist, das als Teil des Workspaces verwaltet werden soll.

### Vorteile von Workspaces

- **Vereinfachtes Dependency-Management**: Das Ausführen von `npm install` vom Projekt-Root aus installiert alle Abhängigkeiten für alle Pakete im Workspace und verknüpft sie miteinander. Das bedeutet, dass du `npm install` nicht in jedem Paketverzeichnis einzeln ausführen musst.
- **Automatisches Linking**: Pakete innerhalb des Workspaces können voneinander abhängen. Wenn du `npm install` ausführst, erstellt NPM automatisch Symlinks zwischen den Paketen. Das bedeutet, dass Änderungen an einem Paket sofort für andere Pakete verfügbar sind, die davon abhängen.
- **Vereinfachte Skriptausführung**: Du kannst Skripte in jedem Paket vom Projekt-Root aus mit dem `--workspace`-Flag ausführen. Um beispielsweise das `build`-Skript im `cli`-Paket auszuführen, kannst du `npm run build --workspace @qwen-code/qwen-code` ausführen.