# Paketübersicht

Dieses Monorepo enthält zwei Hauptpakete: `@qwen-code/qwen-code` und `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Dies ist das Hauptpaket für Qwen Code. Es ist verantwortlich für die Benutzeroberfläche, die Befehlsverarbeitung und alle anderen benutzerseitigen Funktionen.

Wenn dieses Paket veröffentlicht wird, wird es in eine einzelne ausführbare Datei gebündelt. Dieses Bundle enthält alle Abhängigkeiten des Pakets, einschließlich `@qwen-code/qwen-code-core`. Das bedeutet, egal ob ein Benutzer das Paket mit `npm install -g @qwen-code/qwen-code` installiert oder es direkt mit `npx @qwen-code/qwen-code` ausführt, er verwendet diese einzelne, eigenständige ausführbare Datei.

## `@qwen-code/qwen-code-core`

Dieses Paket enthält die Kernlogik für die CLI. Es ist verantwortlich für das Senden von API-Anfragen an konfigurierte Anbieter, die Handhabung der Authentifizierung und das Verwalten des lokalen Caches.

Dieses Paket wird nicht gebündelt. Bei der Veröffentlichung wird es als Standard-Node.js-Paket mit seinen eigenen Abhängigkeiten veröffentlicht. Dadurch kann es bei Bedarf als eigenständiges Paket in anderen Projekten verwendet werden. Der gesamte transpilierte JavaScript-Code im `dist`-Ordner ist im Paket enthalten.

# Veröffentlichungsprozess

Dieses Projekt folgt einem strukturierten Veröffentlichungsprozess, um sicherzustellen, dass alle Pakete korrekt versioniert und veröffentlicht werden. Der Prozess ist so weit wie möglich automatisiert.

## Wie man eine Version veröffentlicht

Versionen werden über den GitHub Actions Workflow [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) verwaltet. Um eine manuelle Veröffentlichung für einen Patch oder Hotfix durchzuführen:

1.  Navigiere zum **Actions**-Tab des Repositories.
2.  Wähle den **Release**-Workflow aus der Liste aus.
3.  Klicke auf die Dropdown-Schaltfläche **Run workflow**.
4.  Fülle die erforderlichen Eingaben aus:
    - **Version**: Die genaue Version, die veröffentlicht werden soll (z. B. `v0.2.1`).
    - **Ref**: Der Branch oder Commit-SHA, von dem aus veröffentlicht werden soll (standardmäßig `main`).
    - **Dry Run**: Lasse dies als `true`, um den Workflow zu testen, ohne ihn zu veröffentlichen, oder setze es auf `false`, um eine Live-Version durchzuführen.
5.  Klicke auf **Run workflow**.

## Versionsarten

Das Projekt unterstützt mehrere Arten von Veröffentlichungen:

### Stabile Versionen

Regelmäßige stabile Versionen für den Produktivbetrieb.

### Vorschau-Versionen

Wöchentliche Vorschau-Versionen jeden Dienstag um 23:59 UTC für frühen Zugriff auf bevorstehende Funktionen.

### Nightly-Releases

Tägliche Nightly-Releases um Mitternacht UTC für Tests der neuesten Entwicklungsstände.

## Automatisierter Release-Zeitplan

- **Nightly**: Jeden Tag um Mitternacht UTC
- **Preview**: Jeden Dienstag um 23:59 UTC
- **Stable**: Manuelle Releases, ausgelöst von Maintainern

### Verwendung verschiedener Release-Typen

So installieren Sie die neueste Version jedes Typs:

```bash

# Stable (Standard)
npm install -g @qwen-code/qwen-code

# Preview
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Details zum Release-Prozess

Jedes geplante oder manuelle Release folgt diesen Schritten:

1.  Checkt den angegebenen Code aus (neuester Stand vom `main`-Branch oder ein bestimmter Commit).
2.  Installiert alle Abhängigkeiten.
3.  Führt die vollständige Suite von `preflight`-Checks und Integrationstests aus.
4.  Falls alle Tests erfolgreich sind, wird die passende Versionsnummer basierend auf dem Release-Typ berechnet.
5.  Erstellt und veröffentlicht die Pakete auf npm mit dem entsprechenden dist-tag.
6.  Erstellt ein GitHub Release für die Version.

### Umgang mit Fehlern

Falls ein Schritt im Release-Workflow fehlschlägt, wird automatisch ein neues Issue im Repository erstellt, das mit `bug` und einem typspezifischen Fehlerlabel (z. B. `nightly-failure`, `preview-failure`) versehen ist. Das Issue enthält einen Link zum fehlgeschlagenen Workflow-Lauf zur einfachen Fehlersuche.

## Release-Validierung

Nach dem Pushen eines neuen Releases sollte ein Smoke-Test durchgeführt werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Dies kann erreicht werden, indem die Pakete lokal installiert und eine Reihe von Tests ausgeführt werden, um ihre ordnungsgemäße Funktionsweise zu gewährleisten.

- `npx -y @qwen-code/qwen-code@latest --version`, um zu überprüfen, ob der Push wie erwartet funktioniert hat, sofern kein RC- oder Dev-Tag verwendet wurde
- `npx -y @qwen-code/qwen-code@<release tag> --version`, um zu bestätigen, dass das Tag korrekt gepusht wurde
- _Dies ist lokal destruktiv_: `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- Es wird empfohlen, einen einfachen Smoke-Test mit ein paar LLM-Befehlen und Tools durchzuführen, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Wir werden dies in Zukunft weiter formalisieren.

## Wann sollte die Versionsänderung gemerged werden, und wann nicht?

Das oben beschriebene Muster zum Erstellen von Patch- oder Hotfix-Releases aus aktuellen oder älteren Commits hinterlässt das Repository im folgenden Zustand:

1.  Der Tag (`vX.Y.Z-patch.1`): Dieser Tag zeigt korrekterweise auf den ursprünglichen Commit im Main-Branch,
    der den stabilen Code enthält, den Sie veröffentlichen wollten. Das ist entscheidend. Jeder, der diesen Tag auscheckt,
    erhält exakt den Code, der veröffentlicht wurde.
2.  Der Branch (`release-vX.Y.Z-patch.1`): Dieser Branch enthält einen neuen Commit über dem
    getaggten Commit. Dieser neue Commit enthält nur die Versionsnummer-Änderung in der package.json
    (und anderen zugehörigen Dateien wie package-lock.json).

Diese Trennung ist gut. Sie hält den Verlauf Ihres Main-Branches sauber von Release-spezifischen
Versionsanhebungen, bis Sie sich entscheiden, diese zu mergen.

Dies ist die kritische Entscheidung, und sie hängt vollständig von der Art des Releases ab.

### Merge-Back für stabile Patches und Hotfixes

In den meisten Fällen solltest du den `release-<tag>`-Branch zurück in `main` mergen,
sobald du einen stabilen Patch oder Hotfix veröffentlichst.

- Warum? Der Hauptgrund ist die Aktualisierung der Version in der package.json des main-Branches.
  Wenn du z. B. v1.2.1 von einem älteren Commit heraus veröffentlichst, aber den Versionsanstieg
  nie zurückmergeest, wird deine package.json im main-Branch weiterhin `"version": "1.2.0"`
  anzeigen. Der nächste Entwickler, der mit der Arbeit an der nächsten Feature-Version (z. B. v1.3.0)
  beginnt, wird von einer Codebasis ausgehen, die eine falsche, veraltete Versionsnummer trägt.
  Das führt zu Verwirrung und erfordert später ein manuelles Anheben der Version.
- Der Prozess: Nachdem der release-v1.2.1-Branch erstellt wurde und das Paket erfolgreich
  veröffentlicht ist, solltest du einen Pull Request öffnen, um release-v1.2.1 in main zu
  mergen. Dieser PR enthält nur einen einzigen Commit: „chore: bump version to v1.2.1“.
  Es handelt sich um eine saubere, einfache Integration, die deinen main-Branch mit der
  neuesten veröffentlichten Version synchron hält.

### NICHT Zurückführen für Vorabversionen (RC, Beta, Dev)

Release-Branches für Vorabversionen werden in der Regel nicht zurück in `main` gemerged.

- Warum? Vorabversionen (z. B. v1.3.0-rc.1, v1.3.0-rc.2) sind definitionsgemäß nicht stabil und nur temporär. Sie möchten den Verlauf Ihres Hauptzweigs nicht mit einer Reihe von Versionsanpassungen für Release-Kandidaten verschmutzen. Die package.json in `main` sollte die neueste stabile Release-Version widerspiegeln, nicht eine RC.
- Der Prozess: Der Branch release-v1.3.0-rc.1 wird erstellt, der Befehl `npm publish --tag rc` wird ausgeführt, und danach hat der Branch seinen Zweck erfüllt. Sie können ihn einfach löschen. Der Code für die RC befindet sich bereits in `main` (oder einem Feature-Branch), sodass kein funktionaler Code verloren geht. Der Release-Branch war nur ein temporäres Mittel zum Zweck der Versionsnummer.

## Lokales Testen und Validieren: Änderungen am Pack- und Veröffentlichungsprozess

Wenn du den Release-Prozess testen musst, ohne tatsächlich auf NPM zu veröffentlichen oder ein öffentliches GitHub-Release zu erstellen, kannst du den Workflow manuell über die GitHub-Benutzeroberfläche auslösen.

1. Gehe zum [Actions-Tab](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) des Repositorys.
2. Klicke auf das Dropdown-Menü „Run workflow“.
3. Lasse die Option `dry_run` aktiviert (`true`).
4. Klicke auf die Schaltfläche „Run workflow“.

Dadurch wird der gesamte Release-Prozess ausgeführt, jedoch werden die Schritte `npm publish` und `gh release create` übersprungen. Du kannst die Workflow-Protokolle einsehen, um sicherzustellen, dass alles wie erwartet funktioniert.

Es ist entscheidend, alle Änderungen am Pack- und Veröffentlichungsprozess lokal zu testen, bevor du sie committest. Dadurch wird sichergestellt, dass die Pakete korrekt veröffentlicht werden und wie erwartet funktionieren, wenn sie von einem Benutzer installiert werden.

Um deine Änderungen zu validieren, kannst du einen Dry-Run des Veröffentlichungsprozesses durchführen. Dies simuliert den Veröffentlichungsprozess, ohne die Pakete tatsächlich im npm-Registry zu veröffentlichen.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Dieser Befehl führt folgende Aktionen aus:

1. Erstellt alle Pakete.
2. Führt alle Prepublish-Skripte aus.
3. Erstellt die Paket-Tarballs, die auf npm veröffentlicht würden.
4. Gibt eine Zusammenfassung der Pakete aus, die veröffentlicht würden.

Du kannst dann die generierten Tarballs überprüfen, um sicherzustellen, dass sie die richtigen Dateien enthalten und dass die `package.json`-Dateien korrekt aktualisiert wurden. Die Tarballs werden im Stammverzeichnis jedes Pakets erstellt (z. B. `packages/cli/qwen-code-0.1.6.tgz`).

Durch das Durchführen eines Dry-Runs kannst du sicher sein, dass deine Änderungen am Packprozess korrekt sind und dass die Pakete erfolgreich veröffentlicht werden.

## Release Deep Dive

Das Hauptziel des Release-Prozesses ist es, den Quellcode aus dem Verzeichnis `packages/` zu nehmen, zu bauen und ein sauberes, eigenständiges Paket in einem temporären `dist`-Verzeichnis im Projektstamm zusammenzustellen. Dieses `dist`-Verzeichnis ist dasjenige, das tatsächlich auf NPM veröffentlicht wird.

Hier sind die wichtigsten Phasen:

Phase 1: Vorab-Prüfungen und Versionsverwaltung

- Was passiert: Bevor Dateien verschoben werden, stellt der Prozess sicher, dass sich das Projekt in einem guten Zustand befindet. Dazu gehören das Ausführen von Tests, Linting und Typüberprüfung (`npm run preflight`). Die Versionsnummer in der `package.json` im Stammverzeichnis und in `packages/cli/package.json` wird auf die neue Release-Version aktualisiert.
- Warum: Dadurch wird gewährleistet, dass nur hochwertiger, funktionierender Code veröffentlicht wird. Die Versionsverwaltung ist der erste Schritt, um ein neues Release zu kennzeichnen.

Phase 2: Kompilierung des Quellcodes

- Was passiert: Der TypeScript-Quellcode in `packages/core/src` und `packages/cli/src` wird in JavaScript kompiliert.
- Dateibewegung:
  - `packages/core/src/**/*.ts` → kompiliert nach → `packages/core/dist/`
  - `packages/cli/src/**/*.ts` → kompiliert nach → `packages/cli/dist/`
- Warum: Der während der Entwicklung geschriebene TypeScript-Code muss in reines JavaScript umgewandelt werden, das von Node.js ausgeführt werden kann. Das Core-Paket wird zuerst gebaut, da das CLI-Paket davon abhängt.

Phase 3: Bündelung und Zusammenstellung des finalen, veröffentlichbaren Pakets

Dies ist die entscheidendste Phase, in der Dateien in ihren endgültigen Zustand für die Veröffentlichung verschoben und transformiert werden. Der Prozess verwendet moderne Bündeltechniken, um das finale Paket zu erstellen.

1. Erstellung des Bundles:
   - Was passiert: Das Skript `prepare-package.js` erstellt ein sauberes Distributionspaket im `dist`-Verzeichnis.
   - Wichtige Transformationen:
     - Kopiert `README.md` und `LICENSE` nach `dist/`
     - Kopiert den `locales`-Ordner zur Internationalisierung
     - Erstellt eine saubere `package.json` für die Verteilung mit nur den notwendigen Abhängigkeiten
     - Bindet Laufzeitabhängigkeiten wie `tiktoken` ein
     - Behält optionale Abhängigkeiten für `node-pty` bei

2. Das JavaScript-Bundle wird erstellt:
   - Was passiert: Das gebaute JavaScript aus `packages/core/dist` und `packages/cli/dist` wird mit `esbuild` in eine einzelne, ausführbare JavaScript-Datei gebündelt.
   - Speicherort der Datei: `dist/cli.js`
   - Warum: Dies erzeugt eine einzelne, optimierte Datei, die den gesamten notwendigen Anwendungscode enthält. Es vereinfacht das Paket, indem es die Notwendigkeit komplexer Abhängigkeitsauflösung zum Zeitpunkt der Installation entfällt.

3. Statische und unterstützende Dateien werden kopiert:
   - Was passiert: Wesentliche Dateien, die nicht Teil des Quellcodes sind, aber für das korrekte Funktionieren oder die ordnungsgemäße Beschreibung des Pakets erforderlich sind, werden in das `dist`-Verzeichnis kopiert.
   - Dateibewegung:
     - `README.md` → `dist/README.md`
     - `LICENSE` → `dist/LICENSE`
     - `locales/` → `dist/locales/`
     - Vendor-Dateien → `dist/vendor/`
   - Warum:
     - Die `README.md` und `LICENSE` sind Standarddateien, die in jedes NPM-Paket aufgenommen werden sollten.
     - Lokalisierungsdaten unterstützen internationale Funktionen
     - Vendor-Dateien enthalten notwendige Laufzeitabhängigkeiten

Phase 4: Veröffentlichung auf NPM

- Was passiert: Der Befehl `npm publish` wird aus dem `dist`-Stammverzeichnis heraus ausgeführt.
- Warum: Indem `npm publish` aus dem `dist`-Verzeichnis heraus ausgeführt wird, werden nur die Dateien hochgeladen, die wir sorgfältig in Phase 3 zusammengestellt haben. Dies verhindert, dass versehentlich Quellcode, Testdateien oder Entwicklerkonfigurationen veröffentlicht werden, was zu einem sauberen und minimalistischen Paket für die Nutzer führt.

Dieser Prozess stellt sicher, dass das letztendlich veröffentlichte Artefakt eine gezielt erstellte, saubere und effiziente Darstellung des Projekts ist – und kein direkter Abzug des Entwicklungsarbeitsbereichs.

## NPM Workspaces

Dieses Projekt verwendet [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces), um die Pakete innerhalb dieses Monorepos zu verwalten. Dies vereinfacht die Entwicklung, da wir Abhängigkeiten verwalten und Skripte über mehrere Pakete hinweg aus dem Stammverzeichnis des Projekts ausführen können.

### Funktionsweise

Die root `package.json`-Datei definiert die Workspaces für dieses Projekt:

```json
{
  "workspaces": ["packages/*"]
}
```

Dies teilt NPM mit, dass jeder Ordner innerhalb des `packages`-Verzeichnisses ein separates Paket ist, das als Teil des Workspaces verwaltet werden sollte.

### Vorteile von Workspaces

- **Vereinfachte Abhängigkeitsverwaltung**: Wenn du `npm install` im Stammverzeichnis des Projekts ausführst, werden alle Abhängigkeiten für alle Pakete im Workspace installiert und miteinander verknüpft. Das bedeutet, dass du nicht in jedem Paketverzeichnis `npm install` ausführen musst.
- **Automatische Verknüpfung**: Pakete innerhalb des Workspaces können voneinander abhängen. Wenn du `npm install` ausführst, erstellt NPM automatisch symbolische Links zwischen den Paketen. Das heißt, wenn du Änderungen an einem Paket vornimmst, stehen diese sofort für andere Pakete zur Verfügung, die davon abhängen.
- **Vereinfachte Skriptausführung**: Du kannst Skripte in beliebigen Paketen vom Stammverzeichnis des Projekts aus mit dem Flag `--workspace` ausführen. Um beispielsweise das `build`-Skript im `cli`-Paket auszuführen, kannst du `npm run build --workspace @qwen-code/qwen-code` ausführen.