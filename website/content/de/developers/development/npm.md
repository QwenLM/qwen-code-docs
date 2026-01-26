# Paketübersicht

Dieses Monorepo enthält zwei Hauptpakete: `@qwen-code/qwen-code` und `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Dies ist das Hauptpaket für Qwen Code. Es ist verantwortlich für die Benutzeroberfläche, Befehlsverarbeitung und alle anderen funktionalitäten, mit denen der Benutzer interagiert.

Wenn dieses Paket veröffentlicht wird, wird es in eine einzige ausführbare Datei gebündelt. Dieses Bundle enthält alle Abhängigkeiten des Pakets, einschließlich `@qwen-code/qwen-code-core`. Das bedeutet, dass ein Benutzer, egal ob er das Paket mit `npm install -g @qwen-code/qwen-code` installiert oder direkt mit `npx @qwen-code/qwen-code` ausführt, diese einzelne, eigenständige ausführbare Datei verwendet.

## `@qwen-code/qwen-code-core`

Dieses Paket enthält die Kernlogik für die CLI. Es ist verantwortlich für das Senden von API-Anfragen an konfigurierte Anbieter, die Behandlung der Authentifizierung und das Verwalten des lokalen Caches.

Dieses Paket wird nicht gebündelt. Bei der Veröffentlichung erfolgt dies als Standard-Node.js-Paket mit eigenen Abhängigkeiten. Dadurch kann es bei Bedarf als eigenständiges Paket in anderen Projekten verwendet werden. Der gesamte transpilierte JavaScript-Code im `dist`-Ordner ist im Paket enthalten.

# Veröffentlichungsprozess

Dieses Projekt folgt einem strukturierten Veröffentlichungsprozess, um sicherzustellen, dass alle Pakete korrekt versioniert und veröffentlicht werden. Der Prozess ist so automatisiert wie möglich gestaltet.

## So wird veröffentlicht

Veröffentlichungen werden über den GitHub Actions-Workflow [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) verwaltet. Um eine manuelle Veröffentlichung für einen Patch oder Hotfix durchzuführen:

1.  Navigieren Sie zum Reiter **Actions** des Repositorys.
2.  Wählen Sie den Workflow **Release** aus der Liste aus.
3.  Klicken Sie auf das Dropdown-Menü **Run workflow**.
4.  Füllen Sie die erforderlichen Eingaben aus:
    - **Version**: Die exakte Version, die veröffentlicht werden soll (z. B. `v0.2.1`).
    - **Ref**: Der Branch oder Commit-SHA, aus dem veröffentlicht werden soll (Standard ist `main`).
    - **Dry Run**: Auf `true` belassen, um den Workflow zu Testzwecken ohne Veröffentlichung auszuführen, oder auf `false` setzen, um eine echte Veröffentlichung durchzuführen.
5.  Klicken Sie auf **Run workflow**.

## Veröffentlichungsarten

Das Projekt unterstützt verschiedene Arten von Veröffentlichungen:

### Stabile Veröffentlichungen

Reguläre stabile Veröffentlichungen für den Produktiveinsatz.

### Vorschauveröffentlichungen

Wöchentliche Vorschauveröffentlichungen jeden Dienstag um 23:59 UTC für frühen Zugriff auf kommende Funktionen.

### Nightly-Versionen

Tägliche Nightly-Versionen um Mitternacht UTC für Entwicklungs- und Testzwecke mit dem neuesten Stand.

## Automatischer Veröffentlichungsplan

- **Nightly**: Jeden Tag um Mitternacht UTC
- **Vorschau**: Jeden Dienstag um 23:59 UTC
- **Stabil**: Manuelle Veröffentlichungen durch die Maintainer

### So verwenden Sie verschiedene Versionstypen

So installieren Sie die jeweils neueste Version jedes Typs:

```bash

# Stabil (Standard)
npm install -g @qwen-code/qwen-code

# Vorschau
npm install -g @qwen-code/qwen-code@preview

# Nightly
npm install -g @qwen-code/qwen-code@nightly
```

### Details des Veröffentlichungsprozesses

Jede geplante oder manuelle Veröffentlichung folgt diesen Schritten:

1.  Holt den angegebenen Code (neuester Stand vom `main`-Branch oder spezifischem Commit).
2.  Installiert alle Abhängigkeiten.
3.  Führt die vollständige Suite der `preflight`-Prüfungen und Integrationstests aus.
4.  Wenn alle Tests erfolgreich sind, wird die geeignete Versionsnummer basierend auf dem Veröffentlichungstyp berechnet.
5.  Erstellt und veröffentlicht die Pakete auf npm mit dem entsprechenden Dist-Tag.
6.  Erstellt eine GitHub-Veröffentlichung für die Version.

### Fehlerbehandlung

Wenn ein beliebiger Schritt im Veröffentlichungsworkflow fehlschlägt, wird automatisch ein neues Issue im Repository mit den Labels `bug` und einem typspezifischen Fehlerlabel (z.B. `nightly-failure`, `preview-failure`) erstellt. Das Issue enthält einen Link zur fehlgeschlagenen Workflow-Ausführung zum einfachen Debuggen.

## Release-Validierung

Nach dem Veröffentlichen einer neuen Version sollte eine grundlegende Testabdeckung durchgeführt werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Dies kann durch lokale Installation der Pakete und Ausführung einer Reihe von Tests erfolgen, um deren korrekte Funktionsweise zu überprüfen.

- `npx -y @qwen-code/qwen-code@latest --version`, um zu validieren, dass der Push wie erwartet funktioniert hat, falls Sie keinen rc- oder dev-Tag verwendet haben
- `npx -y @qwen-code/qwen-code@<Release-Tag> --version`, um zu validieren, dass der Tag ordnungsgemäß gepusht wurde
- _Dies ist lokal destruktiv_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<Version>`
- Es wird empfohlen, eine grundlegende Testabdeckung durchzuführen, bei der einige LLM-Befehle und Tools ausgeführt werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Wir werden dies in Zukunft weiter formalisieren.

## Wann die Versionsänderung zusammenführen, oder nicht?

Das oben beschriebene Muster zum Erstellen von Patch- oder Hotfix-Releases aus aktuellen oder älteren Commits lässt das Repository in folgendem Zustand zurück:

1.  Der Tag (`vX.Y.Z-patch.1`): Dieser Tag zeigt korrekterweise auf den ursprünglichen Commit im Main,
    der den stabilen Code enthält, den Sie veröffentlichen wollten. Das ist entscheidend. Jeder, der
    diesen Tag auscheckt, erhält exakt den Code, der veröffentlicht wurde.
2.  Der Branch (`release-vX.Y.Z-patch.1`): Dieser Branch enthält einen neuen Commit auf dem getaggten
    Commit. Dieser neue Commit enthält nur die Änderung der Versionsnummer in der package.json
    (und anderen verwandten Dateien wie package-lock.json).

Diese Trennung ist gut. Sie hält Ihren Main-Branch sauber von versionsbezogenen Änderungen,
bis Sie entscheiden, diese zusammenzuführen.

Dies ist die kritische Entscheidung, und sie hängt vollständig von der Art des Releases ab.

### Merge Back für stabile Patches und Hotfixes

Sie möchten fast immer den `release-<tag>`-Branch in den `main`-Branch mergen,
wenn es sich um ein stabiles Patch- oder Hotfix-Release handelt.

- Warum? Der Hauptgrund ist die Aktualisierung der Version in der package.json des Main-Branches. Wenn Sie
  v1.2.1 von einem älteren Commit aus veröffentlichen, aber das Versions-Update nie zurückmergen, enthält die
  package.json Ihres Main-Branches weiterhin "version": "1.2.0". Der nächste Entwickler, der an der nächsten
  Feature-Version (v1.3.0) arbeitet, wird von einem Code-Basiszweig aus starten, der eine falsche, ältere
  Versionsnummer aufweist. Dies führt zu Verwirrung und erfordert später manuelle Versionsaktualisierungen.
- Der Prozess: Nachdem der Branch release-v1.2.1 erstellt wurde und das Paket erfolgreich veröffentlicht
  wurde, sollten Sie einen Pull Request öffnen, um release-v1.2.1 in main zu mergen. Dieser PR enthält nur
  einen Commit: "chore: bump version to v1.2.1". Es ist eine saubere, einfache Integration, die Ihren
  Main-Branch mit der neuesten veröffentlichten Version synchronisiert hält.

### NICHT zurück in Pre-Releases (RC, Beta, Dev) mergen

Sie mergen Release-Branches für Pre-Releases typischerweise nicht zurück in `main`.

- Warum? Pre-Release-Versionen (z.B. v1.3.0-rc.1, v1.3.0-rc.2) sind per Definition nicht
  stabil und temporär. Sie möchten die Historie Ihres Main-Branches nicht mit einer
  Reihe von Versionierungsänderungen für Release-Kandidaten verunreinigen. Die package.json
  in main sollte die neueste stabile Release-Version widerspiegeln, nicht eine RC-Version.
- Der Ablauf: Der Branch release-v1.3.0-rc.1 wird erstellt, das npm publish --tag rc findet statt,
  und dann... hat der Branch seinen Zweck erfüllt. Sie können ihn einfach löschen. Der Code für
  den RC ist bereits in main (oder einem Feature-Branch), also geht keine funktionale Logik verloren. Der
  Release-Branch war lediglich ein vorübergehendes Transportmittel für die Versionsnummer.

## Lokales Testen und Validierung: Änderungen am Verpackungs- und Veröffentlichungsprozess

Wenn Sie den Veröffentlichungsprozess testen möchten, ohne tatsächlich auf NPM zu veröffentlichen oder eine öffentliche GitHub-Veröffentlichung zu erstellen, können Sie den Workflow manuell über die GitHub-Benutzeroberfläche auslösen.

1.  Gehen Sie zur [Registerkarte „Actions“](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) des Repositorys.
2.  Klicken Sie auf das Dropdown-Menü „Run workflow“.
3.  Lassen Sie die Option `dry_run` aktiviert (`true`).
4.  Klicken Sie auf die Schaltfläche „Run workflow“.

Dadurch wird der gesamte Veröffentlichungsprozess ausgeführt, aber die Schritte `npm publish` und `gh release create` werden übersprungen. Sie können die Workflow-Protokolle überprüfen, um sicherzustellen, dass alles wie erwartet funktioniert.

Es ist entscheidend, alle Änderungen am Verpackungs- und Veröffentlichungsprozess lokal zu testen, bevor sie committet werden. Dies stellt sicher, dass die Pakete korrekt veröffentlicht werden und wie erwartet funktionieren, wenn sie von einem Benutzer installiert werden.

Zur Validierung Ihrer Änderungen können Sie einen Trockentest des Veröffentlichungsprozesses durchführen. Dadurch wird der Veröffentlichungsprozess simuliert, ohne die Pakete tatsächlich im npm-Registry zu veröffentlichen.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Dieser Befehl führt Folgendes aus:

1.  Erstellt alle Pakete.
2.  Führt alle prepublish-Skripte aus.
3.  Erstellt die Paket-Tarballs, die auf npm veröffentlicht würden.
4.  Gibt eine Zusammenfassung der Pakete aus, die veröffentlicht würden.

Anschließend können Sie die generierten Tarballs überprüfen, um sicherzustellen, dass sie die richtigen Dateien enthalten und die `package.json`-Dateien korrekt aktualisiert wurden. Die Tarballs werden im Stammverzeichnis jedes Paketverzeichnisses erstellt (z. B. `packages/cli/qwen-code-0.1.6.tgz`).

Durch die Durchführung eines Trockentests können Sie sicher sein, dass Ihre Änderungen am Verpackungsprozess korrekt sind und die Pakete erfolgreich veröffentlicht werden.

## Detaillierte Betrachtung des Releases

Das Hauptziel des Release-Prozesses ist es, den Quellcode aus dem Verzeichnis packages/ zu nehmen, ihn zu bauen und ein sauberes, eigenständiges Paket in einem temporären `dist`-Verzeichnis im Stammverzeichnis des Projekts zusammenzustellen. Dieses `dist`-Verzeichnis ist es, das tatsächlich auf NPM veröffentlicht wird.

Hier sind die wichtigsten Phasen:

Phase 1: Vorab-Prüfungen und Versionsverwaltung

- Was passiert: Bevor Dateien verschoben werden, stellt der Prozess sicher, dass sich das Projekt in einem guten Zustand befindet. Dazu gehören das Ausführen von Tests, Linting und Typprüfung (npm run preflight). Die Versionsnummer in der root package.json und in packages/cli/package.json wird auf die neue Release-Version aktualisiert.
- Warum: Dadurch wird garantiert, dass nur qualitativ hochwertiger, funktionierender Code veröffentlicht wird. Die Versionsverwaltung ist der erste Schritt, um eine neue Version zu kennzeichnen.

Phase 2: Erstellen des Quellcodes

- Was passiert: Der TypeScript-Quellcode in packages/core/src und packages/cli/src wird in JavaScript kompiliert.
- Dateiverschiebung:
  - packages/core/src/\*\*/\*.ts -> kompiliert nach -> packages/core/dist/
  - packages/cli/src/\*\*/\*.ts -> kompiliert nach -> packages/cli/dist/
- Warum: Der während der Entwicklung geschriebene TypeScript-Code muss in reines JavaScript konvertiert werden, das von Node.js ausgeführt werden kann. Das Core-Paket wird zuerst gebaut, da das CLI-Paket davon abhängt.

Phase 3: Bündelung und Zusammenstellung des endgültigen veröffentlichbaren Pakets

Dies ist die kritischste Phase, in der Dateien verschoben und in ihren endgültigen Zustand für die Veröffentlichung überführt werden. Der Prozess verwendet moderne Bündelungstechniken, um das endgültige Paket zu erstellen.

1.  Bundle-Erstellung:
    - Was passiert: Das Skript prepare-package.js erstellt ein sauberes Verteilungspaket im `dist`-Verzeichnis.
    - Wichtige Transformationen:
      - Kopiert README.md und LICENSE nach dist/
      - Kopiert den Ordner locales für Internationalisierung
      - Erstellt eine saubere package.json für die Distribution mit nur notwendigen Abhängigkeiten
      - Hält die Verteilungsabhängigkeiten minimal (keine gebündelten Laufzeitabhängigkeiten)
      - Behält optionale Abhängigkeiten für node-pty bei

2.  Das JavaScript-Bundle wird erstellt:
    - Was passiert: Das gebaute JavaScript aus packages/core/dist und packages/cli/dist wird mithilfe von esbuild in eine einzige, ausführbare JavaScript-Datei gebündelt.
    - Dateispeicherort: dist/cli.js
    - Warum: Dadurch entsteht eine einzelne, optimierte Datei, die den gesamten notwendigen Anwendungscode enthält. Es vereinfacht das Paket, indem es die Notwendigkeit komplexer Abhängigkeitsauflösung zur Installationszeit entfernt.

3.  Statische und unterstützende Dateien werden kopiert:
    - Was passiert: Wesentliche Dateien, die nicht Teil des Quellcodes sind, aber benötigt werden, damit das Paket korrekt funktioniert oder gut beschrieben ist, werden in das `dist`-Verzeichnis kopiert.
    - Dateiverschiebung:
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Vendor-Dateien -> dist/vendor/
    - Warum:
      - Die README.md und LICENSE sind Standarddateien, die in jedes NPM-Paket eingeschlossen sein sollten.
      - Lokalisierungen unterstützen Internationalisierungsfunktionen
      - Vendor-Dateien enthalten notwendige Laufzeitabhängigkeiten

Phase 4: Veröffentlichung auf NPM

- Was passiert: Der Befehl npm publish wird innerhalb des root `dist`-Verzeichnisses ausgeführt.
- Warum: Durch das Ausführen von npm publish innerhalb des `dist`-Verzeichnisses werden nur die Dateien, die wir sorgfältig in Phase 3 zusammengestellt haben, in das NPM-Registry hochgeladen. Dadurch wird verhindert, dass versehentlich Quellcode, Testdateien oder Entwicklungs-Konfigurationen veröffentlicht werden, was zu einem sauberen und minimalen Paket für Benutzer führt.

Dieser Prozess stellt sicher, dass das endgültig veröffentlichte Artefakt eine gezielt erstellte, saubere und effiziente Darstellung des Projekts ist, anstatt einer direkten Kopie des Entwicklungsarbeitsbereichs.

## NPM Workspaces

Dieses Projekt verwendet [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces), um die Pakete innerhalb dieses Monorepos zu verwalten. Dies vereinfacht die Entwicklung, da wir so Abhängigkeiten verwalten und Skripte über mehrere Pakete hinweg aus der Wurzel des Projekts heraus ausführen können.

### Funktionsweise

Die Root-Datei `package.json` definiert die Workspaces für dieses Projekt:

```json
{
  "workspaces": ["packages/*"]
}
```

Dies weist NPM an, dass jeder Ordner innerhalb des Verzeichnisses `packages` ein separates Paket ist, das als Teil des Workspace verwaltet werden soll.

### Vorteile von Workspaces

- **Vereinfachte Abhängigkeitsverwaltung**: Durch Ausführen von `npm install` im Stammverzeichnis des Projekts werden alle Abhängigkeiten für alle Pakete im Workspace installiert und miteinander verknüpft. Das bedeutet, dass Sie nicht in jedem Paketverzeichnis einzeln `npm install` ausführen müssen.
- **Automatische Verknüpfung**: Pakete innerhalb des Workspaces können voneinander abhängen. Wenn Sie `npm install` ausführen, erstellt NPM automatisch symbolische Verknüpfungen (Symlinks) zwischen den Paketen. Dadurch sind Änderungen an einem Paket sofort für andere Pakete verfügbar, die davon abhängen.
- **Vereinfachte Skriptausführung**: Sie können Skripte in beliebigen Paketen vom Projektstamm aus mit dem Flag `--workspace` ausführen. Um beispielsweise das `build`-Skript im Paket `cli` auszuführen, können Sie `npm run build --workspace @qwen-code/qwen-code` verwenden.