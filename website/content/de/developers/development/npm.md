# Paketübersicht

Dieses Monorepo enthält zwei Hauptpakete: `@qwen-code/qwen-code` und `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Dies ist das Hauptpaket für Qwen Code. Es ist für die Benutzeroberfläche, die Befehlsanalyse und alle anderen benutzerseitigen Funktionen verantwortlich.

Wenn dieses Paket veröffentlicht wird, wird es zu einer einzigen ausführbaren Datei gebündelt. Dieses Bundle enthält alle Abhängigkeiten des Pakets, einschließlich `@qwen-code/qwen-code-core`. Das bedeutet, dass ein Benutzer, egal ob er das Paket mit `npm install -g @qwen-code/qwen-code` installiert oder direkt mit `npx @qwen-code/qwen-code` ausführt, diese einzelne, eigenständige ausführbare Datei verwendet.

## `@qwen-code/qwen-code-core`

Dieses Paket enthält die Kernlogik der CLI. Es ist für API-Anfragen an konfigurierte Anbieter, die Authentifizierung und die Verwaltung des lokalen Caches zuständig.

Dieses Paket wird nicht gebündelt. Bei der Veröffentlichung wird es als normales Node.js-Paket mit eigenen Abhängigkeiten veröffentlicht. Dadurch kann es bei Bedarf als eigenständiges Paket in anderen Projekten verwendet werden. Der gesamte transpilierte JS-Code im Ordner `dist` ist im Paket enthalten.

# Release-Prozess

Dieses Projekt folgt einem strukturierten Release-Prozess, um sicherzustellen, dass alle Pakete korrekt versioniert und veröffentlicht werden. Der Prozess ist so weit wie möglich automatisiert.

## So wird ein Release erstellt

Releases werden über den [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) GitHub Actions-Workflow gesteuert. Um ein manuelles Release für einen Patch oder Hotfix durchzuführen:

1.  Navigieren Sie zum Tab **Actions** des Repositorys.
2.  Wählen Sie den **Release**-Workflow aus der Liste aus.
3.  Klicken Sie auf die Dropdown-Schaltfläche **Run workflow**.
4.  Füllen Sie die erforderlichen Eingaben aus:
    - **Version**: Die genaue Version, die veröffentlicht werden soll (z. B. `v0.2.1`).
    - **Ref**: Der Branch oder Commit-SHA, von dem aus veröffentlicht werden soll (Standard: `main`).
    - **Dry Run**: Lassen Sie `true` aktiviert, um den Workflow zu testen, ohne zu veröffentlichen, oder setzen Sie `false`, um eine Live-Veröffentlichung durchzuführen.
5.  Klicken Sie auf **Run workflow**.

## Release-Typen

Das Projekt unterstützt verschiedene Release-Typen:

### Stabile Releases

Regelmäßige stabile Releases für den Produktionseinsatz.

### Preview-Releases

Wöchentliche Preview-Releases jeden Dienstag um 23:59 UTC für frühen Zugriff auf kommende Funktionen.

### Nightly-Releases

Tägliche Nightly-Releases um Mitternacht UTC für aktuelle Entwicklungstests.

## Automatisierter Release-Zeitplan

- **Nightly**: Jeden Tag um Mitternacht UTC
- **Preview**: Jeden Dienstag um 23:59 UTC
- **Stable**: Manuelle Releases, die von Maintainern ausgelöst werden

### So verwenden Sie verschiedene Release-Typen

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

Jedes geplante oder manuelle Release durchläuft die folgenden Schritte:

1.  Auschecken des angegebenen Codes (neueste Version aus dem `main`-Branch oder einem bestimmten Commit).
2.  Installieren aller Abhängigkeiten.
3.  Ausführen der vollständigen `preflight`-Prüfungen und Integrationstests.
4.  Wenn alle Tests bestanden sind, wird die entsprechende Versionsnummer basierend auf dem Release-Typ berechnet.
5.  Erstellen und Veröffentlichen der Pakete auf npm mit dem entsprechenden dist-tag.
6.  Erstellen eines GitHub-Releases für die Version.

### Fehlerbehandlung

Wenn ein Schritt im Release-Workflow fehlschlägt, wird automatisch ein neues Issue im Repository mit den Labels `bug` und einem typspezifischen Fehlerlabel (z. B. `nightly-failure`, `preview-failure`) erstellt. Das Issue enthält einen Link zum fehlgeschlagenen Workflow-Lauf zur einfachen Fehlersuche.

## Release-Validierung

Nach dem Veröffentlichen eines neuen Releases sollte ein Smoke-Test durchgeführt werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Dies kann durch lokales Installieren der Pakete und Ausführen einer Reihe von Tests erfolgen.

- `npx -y @qwen-code/qwen-code@latest --version`, um zu überprüfen, ob der Push wie erwartet funktioniert hat (falls Sie kein rc- oder dev-Tag verwendet haben)
- `npx -y @qwen-code/qwen-code@<release tag> --version`, um zu überprüfen, ob das Tag korrekt gepusht wurde
- _Dies ist lokal destruktiv_: `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<version>`
- Es wird empfohlen, einen grundlegenden Smoke-Test mit einigen LLM-Befehlen und -Tools durchzuführen, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Dies werden wir in Zukunft stärker standardisieren.

## Wann die Versionsänderung zusammengeführt werden soll – oder nicht?

Das obige Muster zum Erstellen von Patch- oder Hotfix-Releases von aktuellen oder älteren Commits hinterlässt das Repository im folgenden Zustand:

1.  Der Tag (`vX.Y.Z-patch.1`): Dieser Tag zeigt korrekt auf den ursprünglichen Commit auf main, der den stabilen Code enthält, den Sie veröffentlichen wollten. Dies ist entscheidend. Jeder, der diesen Tag auscheckt, erhält den genauen Code, der veröffentlicht wurde.
2.  Der Branch (`release-vX.Y.Z-patch.1`): Dieser Branch enthält einen neuen Commit zusätzlich zum getaggten Commit. Dieser neue Commit enthält nur die Versionsnummernänderung in package.json (und anderen zugehörigen Dateien wie package-lock.json).

Diese Trennung ist gut. Sie hält die History Ihres main-Branches frei von releasespezifischen Versionssprüngen, bis Sie sich entscheiden, sie zusammenzuführen.

Dies ist die entscheidende Entscheidung und hängt vollständig von der Art des Releases ab.

### Rückführung für stabile Patches und Hotfixes

Sie sollten den `release-<tag>`-Branch fast immer zurück in `main` führen, und zwar für jedes stabile Patch- oder Hotfix-Release.

- Warum? Der Hauptgrund ist, die Version in package.json von main zu aktualisieren. Wenn Sie v1.2.1 von einem älteren Commit aus veröffentlichen, aber den Versionssprung nie zurückführen, wird package.json in Ihrem main-Branch immer noch `"version": "1.2.0"` anzeigen. Der nächste Entwickler, der mit der Arbeit am nächsten Feature-Release (v1.3.0) beginnt, wird von einer Codebasis abzweigen, die eine falsche, ältere Versionsnummer hat. Dies führt zu Verwirrung und erfordert später manuelle Versionssprünge.
- Der Prozess: Nachdem der release-v1.2.1-Branch erstellt und das Paket erfolgreich veröffentlicht wurde, sollten Sie einen Pull Request eröffnen, um release-v1.2.1 in main zu mergen. Dieser PR enthält nur einen Commit: `"chore: bump version to v1.2.1"`. Es ist eine saubere, einfache Integration, die Ihren main-Branch mit der neuesten veröffentlichten Version synchron hält.

### Keine Rückführung für Pre-Releases (RC, Beta, Dev)

Release-Branches für Pre-Releases sollten normalerweise **nicht** zurück in `main` geführt werden.

- Warum? Pre-Release-Versionen (z. B. v1.3.0-rc.1, v1.3.0-rc.2) sind per Definition nicht stabil und temporär. Sie möchten die History Ihres main-Branches nicht mit einer Reihe von Versionssprüngen für Release Candidates verschmutzen. package.json in main sollte die neueste stabile Release-Version widerspiegeln, nicht einen RC.
- Der Prozess: Der release-v1.3.0-rc.1-Branch wird erstellt, `npm publish --tag rc` wird ausgeführt, und dann … hat der Branch seinen Zweck erfüllt. Sie können ihn einfach löschen. Der Code für den RC befindet sich bereits auf main (oder einem Feature-Branch), sodass kein funktionaler Code verloren geht. Der Release-Branch war nur ein temporäres Vehikel für die Versionsnummer.

## Lokale Tests und Validierung: Änderungen am Paketierungs- und Veröffentlichungsprozess

Wenn Sie den Release-Prozess testen müssen, ohne tatsächlich auf NPM zu veröffentlichen oder ein öffentliches GitHub-Release zu erstellen, können Sie den Workflow manuell über die GitHub-Oberfläche auslösen.

1.  Gehen Sie zum [Actions-Tab](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) des Repositorys.
2.  Klicken Sie auf das Dropdown-Menü "Run workflow".
3.  Lassen Sie die Option `dry_run` aktiviert (`true`).
4.  Klicken Sie auf die Schaltfläche "Run workflow".

Dadurch wird der gesamte Release-Prozess ausgeführt, aber die Schritte `npm publish` und `gh release create` werden übersprungen. Sie können die Workflow-Logs überprüfen, um sicherzustellen, dass alles wie erwartet funktioniert.

Es ist entscheidend, alle Änderungen am Paketierungs- und Veröffentlichungsprozess lokal zu testen, bevor sie committet werden. Dadurch wird sichergestellt, dass die Pakete korrekt veröffentlicht werden und wie erwartet funktionieren, wenn sie von einem Benutzer installiert werden.

Um Ihre Änderungen zu validieren, können Sie einen Dry-Run des Veröffentlichungsprozesses durchführen. Dieser simuliert den Veröffentlichungsprozess, ohne die Pakete tatsächlich in der npm-Registry zu veröffentlichen.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Dieser Befehl führt Folgendes aus:

1.  Alle Pakete werden gebaut.
2.  Alle Prepublish-Skripte werden ausgeführt.
3.  Die Paket-Tarballs, die auf npm veröffentlicht würden, werden erstellt.
4.  Eine Zusammenfassung der Pakete, die veröffentlicht würden, wird ausgegeben.

Sie können dann die generierten Tarballs überprüfen, um sicherzustellen, dass sie die korrekten Dateien enthalten und die `package.json`-Dateien korrekt aktualisiert wurden. Die Tarballs werden im Stammverzeichnis jedes Pakets erstellt (z. B. `packages/cli/qwen-code-0.1.6.tgz`).

Durch einen Dry-Run können Sie sicher sein, dass Ihre Änderungen am Paketierungsprozess korrekt sind und die Pakete erfolgreich veröffentlicht werden.

## Release im Detail

Das Hauptziel des Release-Prozesses ist es, den Quellcode aus dem `packages/`-Verzeichnis zu nehmen, ihn zu bauen und ein sauberes, eigenständiges Paket in einem temporären `dist`-Verzeichnis im Stammverzeichnis des Projekts zu erstellen. Dieses `dist`-Verzeichnis wird tatsächlich auf NPM veröffentlicht.

Hier sind die wichtigsten Phasen:

Phase 1: Pre-Release-Sanity-Checks und Versionierung

- Was passiert: Bevor Dateien verschoben werden, stellt der Prozess sicher, dass sich das Projekt in einem guten Zustand befindet. Dies beinhaltet das Ausführen von Tests, Linting und Type-Checking (`npm run preflight`). Die Versionsnummer in der root package.json und packages/cli/package.json wird auf die neue Release-Version aktualisiert.
- Warum: Dies garantiert, dass nur qualitativ hochwertiger, funktionierender Code veröffentlicht wird. Die Versionierung ist der erste Schritt, um ein neues Release zu kennzeichnen.

Phase 2: Bauen des Quellcodes

- Was passiert: Der TypeScript-Quellcode in `packages/core/src` und `packages/cli/src` wird in JavaScript kompiliert.
- Dateiverschiebung:
  - packages/core/src/\*_/_.ts -> kompiliert nach -> packages/core/dist/
  - packages/cli/src/\*_/_.ts -> kompiliert nach -> packages/cli/dist/
- Warum: Der während der Entwicklung geschriebene TypeScript-Code muss in einfaches JavaScript umgewandelt werden, das von Node.js ausgeführt werden kann. Das Core-Paket wird zuerst gebaut, da das CLI-Paket davon abhängt.

Phase 3: Bündeln und Zusammenstellen des endgültigen veröffentlichbaren Pakets

Dies ist die kritischste Phase, in der Dateien in ihren endgültigen Zustand zur Veröffentlichung verschoben und transformiert werden. Der Prozess verwendet moderne Bündelungstechniken, um das endgültige Paket zu erstellen.

1.  Bundle-Erstellung:
    - Was passiert: Das Skript `prepare-package.js` erstellt ein sauberes Distributionspaket im `dist`-Verzeichnis.
    - Wichtige Transformationen:
      - Kopiert README.md und LICENSE nach dist/
      - Kopiert den locales-Ordner für Internationalisierung
      - Erstellt eine saubere package.json für die Distribution mit nur den notwendigen Abhängigkeiten
      - Hält die Distributionsabhängigkeiten minimal (keine gebündelten Runtime-Dependencies)
      - Behält optionale Abhängigkeiten für node-pty bei

2.  Das JavaScript-Bundle wird erstellt:
    - Was passiert: Der gebaute JavaScript-Code aus `packages/core/dist` und `packages/cli/dist` wird mit esbuild zu einer einzigen, ausführbaren JavaScript-Datei gebündelt.
    - Dateipfad: dist/cli.js
    - Warum: Dies erstellt eine einzelne, optimierte Datei, die den gesamten notwendigen Anwendungscode enthält. Es vereinfacht das Paket, indem die Notwendigkeit einer komplexen Abhängigkeitsauflösung zur Installationszeit entfällt.

3.  Statische und unterstützende Dateien werden kopiert:
    - Was passiert: Wesentliche Dateien, die nicht Teil des Quellcodes sind, aber für die korrekte Funktion des Pakets oder dessen Beschreibung erforderlich sind, werden in das `dist`-Verzeichnis kopiert.
    - Dateiverschiebung:
      - README.md -> dist/README.md
      - LICENSE -> dist/LICENSE
      - locales/ -> dist/locales/
      - Vendor-Dateien -> dist/vendor/
    - Warum:
      - README.md und LICENSE sind Standarddateien, die in jedem NPM-Paket enthalten sein sollten.
      - Locales unterstützen Internationalisierungsfunktionen
      - Vendor-Dateien enthalten notwendige Runtime-Abhängigkeiten

Phase 4: Veröffentlichung auf NPM

- Was passiert: Der Befehl `npm publish` wird aus dem Stammverzeichnis `dist` ausgeführt.
- Warum: Indem `npm publish` aus dem `dist`-Verzeichnis heraus ausgeführt wird, werden nur die Dateien, die wir in Phase 3 sorgfältig zusammengestellt haben, in die NPM-Registry hochgeladen. Dies verhindert, dass Quellcode, Testdateien oder Entwicklungskonfigurationen versehentlich veröffentlicht werden, und resultiert in einem sauberen und minimalen Paket für die Benutzer.

Dieser Prozess stellt sicher, dass das endgültig veröffentlichte Artefakt eine zweckgebundene, saubere und effiziente Repräsentation des Projekts ist, anstatt eine direkte Kopie des Entwicklungsworkspace.

## NPM Workspaces

Dieses Projekt verwendet [NPM Workspaces](https://docs.npmjs.com/cli/v10/using-npm/workspaces), um die Pakete in diesem Monorepo zu verwalten. Dies vereinfacht die Entwicklung, da wir Abhängigkeiten und Skripte über mehrere Pakete hinweg vom Stammverzeichnis des Projekts aus verwalten können.

### Funktionsweise

Die root `package.json`-Datei definiert die Workspaces für dieses Projekt:

```json
{
  "workspaces": ["packages/*"]
}
```

Dies teilt NPM mit, dass jeder Ordner im `packages`-Verzeichnis ein separates Paket ist, das als Teil des Workspace verwaltet werden soll.

### Vorteile von Workspaces

- **Vereinfachte Abhängigkeitsverwaltung**: Das Ausführen von `npm install` vom Stammverzeichnis des Projekts installiert alle Abhängigkeiten für alle Pakete im Workspace und verknüpft sie miteinander. Das bedeutet, dass Sie `npm install` nicht in jedem Paketverzeichnis ausführen müssen.
- **Automatische Verknüpfung**: Pakete innerhalb des Workspace können voneinander abhängen. Wenn Sie `npm install` ausführen, erstellt NPM automatisch Symlinks zwischen den Paketen. Das bedeutet, dass Änderungen an einem Paket sofort für andere Pakete verfügbar sind, die davon abhängen.
- **Vereinfachte Skriptausführung**: Sie können Skripte in jedem Paket vom Stammverzeichnis des Projekts aus mit dem Flag `--workspace` ausführen. Um beispielsweise das `build`-Skript im `cli`-Paket auszuführen, können Sie `npm run build --workspace @qwen-code/qwen-code` ausführen.