# Paketübersicht

Dieses Monorepo enthält zwei Hauptpakete: `@qwen-code/qwen-code` und `@qwen-code/qwen-code-core`.

## `@qwen-code/qwen-code`

Dies ist das Hauptpaket für Qwen Code. Es ist für die Benutzeroberfläche, die Befehlsanalyse und sämtliche anderen funktionalen Komponenten zuständig, die dem Benutzer direkt zur Verfügung stehen.

Bei der Veröffentlichung dieses Pakets wird es in eine einzige ausführbare Datei gebündelt. Dieses Bundle enthält sämtliche Abhängigkeiten des Pakets, darunter auch `@qwen-code/qwen-code-core`. Das bedeutet, dass ein Benutzer – egal ob er das Paket mittels `npm install -g @qwen-code/qwen-code` installiert oder es direkt mit `npx @qwen-code/qwen-code` ausführt – stets diese einzige, selbstständige ausführbare Datei verwendet.

## `@qwen-code/qwen-code-core`

Dieses Paket enthält die Kernlogik für die CLI. Es ist zuständig für das Senden von API-Anfragen an konfigurierte Anbieter, das Handling der Authentifizierung sowie das Verwalten des lokalen Caches.

Dieses Paket wird nicht gebündelt. Bei der Veröffentlichung erfolgt diese als standardmäßiges Node.js-Paket mit eigenen Abhängigkeiten. Dadurch kann es bei Bedarf auch als eigenständiges Paket in anderen Projekten verwendet werden. Der gesamte transpilierte JavaScript-Code im Ordner `dist` ist im Paket enthalten.

# Veröffentlichungsprozess

Dieses Projekt folgt einem strukturierten Veröffentlichungsprozess, um sicherzustellen, dass alle Pakete korrekt versioniert und veröffentlicht werden. Der Prozess ist so automatisiert wie möglich gestaltet.

## So führen Sie eine Veröffentlichung durch

Veröffentlichungen werden über den GitHub Actions-Workflow [release.yml](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) verwaltet. Um manuell ein Patch oder einen Hotfix freizugeben:

1.  Navigieren Sie zur Registerkarte **Actions** des Repositorys.
2.  Wählen Sie den Workflow **Release** aus der Liste aus.
3.  Klicken Sie auf die Dropdown-Schaltfläche **Run workflow**.
4.  Geben Sie die erforderlichen Eingaben an:
    - **Version**: Die genaue Version, die veröffentlicht werden soll (z. B. `v0.2.1`).
    - **Ref**: Der Branch oder der Commit-SHA, von dem veröffentlicht werden soll (Standardwert ist `main`).
    - **Dry Run**: Belassen Sie diesen Wert bei `true`, um den Workflow zu testen, ohne tatsächlich zu veröffentlichen, oder setzen Sie ihn auf `false`, um eine Live-Veröffentlichung durchzuführen.
5.  Klicken Sie auf **Run workflow**.

## Typen von Veröffentlichungen

Das Projekt unterstützt mehrere Arten von Veröffentlichungen:

### Stabile Veröffentlichungen

Regelmäßige stabile Veröffentlichungen für den Produktionsbetrieb.

### Vorschauveröffentlichungen

Wöchentliche Vorschauveröffentlichungen jeweils dienstags um 23:59 Uhr UTC, um frühzeitig Zugriff auf kommende Funktionen zu erhalten.

### Nightly-Versionen

Tägliche Nightly-Versionen um Mitternacht UTC für Tests mit der neuesten Entwicklungssoftware.

## Automatischer Veröffentlichungsplan

- **Nightly**: Täglich um Mitternacht UTC  
- **Preview**: Jeden Dienstag um 23:59 UTC  
- **Stable**: Manuelle Veröffentlichungen durch Maintainer

### So verwenden Sie die verschiedenen Versionstypen

So installieren Sie die jeweils neueste Version:

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

1.  Checkt den angegebenen Code aus (neueste Version vom `main`-Branch oder ein bestimmter Commit).
2.  Installiert alle Abhängigkeiten.
3.  Führt die vollständige Suite der `preflight`-Prüfungen und Integrationstests aus.
4.  Falls alle Tests erfolgreich sind, wird die passende Versionsnummer basierend auf dem Release-Typ berechnet.
5.  Baut die Pakete und veröffentlicht sie auf npm mit dem entsprechenden Dist-Tag.
6.  Erstellt ein GitHub-Release für die Version.

### Fehlerbehandlung

Falls ein Schritt im Release-Workflow fehlschlägt, wird automatisch ein neues Issue im Repository mit den Labels `bug` und einem typspezifischen Fehlerlabel (z. B. `nightly-failure`, `preview-failure`) erstellt. Das Issue enthält einen Link zum fehlgeschlagenen Workflow-Lauf, um das Debugging zu vereinfachen.

## Freigabeverifikation

Nach dem Veröffentlichen einer neuen Version sollte ein „Smoke Test“ durchgeführt werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Dazu können die Pakete lokal installiert und eine Reihe von Tests ausgeführt werden, um ihre korrekte Funktionsweise zu überprüfen.

- `npx -y @qwen-code/qwen-code@latest --version`, um zu verifizieren, dass der Push wie erwartet funktioniert hat (sofern keine RC- oder Dev-Version veröffentlicht wurde)
- `npx -y @qwen-code/qwen-code@<Release-Tag> --version`, um zu verifizieren, dass das Tag korrekt gepusht wurde
- _Dies führt lokal zu einer vollständigen Deinstallation:_ `npm uninstall @qwen-code/qwen-code && npm uninstall -g @qwen-code/qwen-code && npm cache clean --force && npm install @qwen-code/qwen-code@<Version>`
- Es wird empfohlen, einen „Smoke Test“ durchzuführen, bei dem einige LLM-Befehle und Tools grundlegend getestet werden, um sicherzustellen, dass die Pakete wie erwartet funktionieren. Diesen Prozess werden wir in Zukunft weiter formalisieren.

## Wann sollte die Versionsänderung zusammengeführt werden – und wann nicht?

Das oben beschriebene Muster zum Erstellen von Patch- oder Hotfix-Releases aus aktuellen oder älteren Commits hinterlässt das Repository im folgenden Zustand:

1.  Der Tag (`vX.Y.Z-patch.1`): Dieser Tag verweist korrekt auf den ursprünglichen Commit in `main`, der den stabilen Code enthält, den Sie veröffentlichen wollten. Das ist entscheidend: Jeder, der diesen Tag auscheckt, erhält exakt den veröffentlichten Code.
2.  Der Branch (`release-vX.Y.Z-patch.1`): Dieser Branch enthält einen neuen Commit oberhalb des getaggten Commits. Dieser neue Commit enthält ausschließlich die Versionsnummer-Anpassung in `package.json` (und anderen zugehörigen Dateien wie `package-lock.json`).

Diese Trennung ist sinnvoll: Sie hält den Verlauf Ihres `main`-Branches sauber von versionsbezogenen Anpassungen für Releases, bis Sie selbst entscheiden, diese zusammenzuführen.

Dies ist die entscheidende Frage – und ihre Beantwortung hängt vollständig von der Art des Releases ab.

### Zurückführen in `main` für stabile Patches und Hotfixes

Sie sollten nahezu immer den Branch `release-<tag>` für jede stabile Patch- oder Hotfix-Version in `main` zurückführen.

- **Warum?** Der wichtigste Grund ist die Aktualisierung der Version in `main`s `package.json`. Wenn Sie z. B. v1.2.1 von einem älteren Commit aus veröffentlichen, aber die Versionsanpassung nicht zurückführen, enthält die Datei `package.json` auf dem `main`-Branch weiterhin `"version": "1.2.0"`. Der nächste Entwickler, der mit der Arbeit an der nächsten Feature-Version (v1.3.0) beginnt, arbeitet dann auf einer Codebasis mit einer falschen, veralteten Versionsnummer. Dies führt zu Verwirrung und erfordert später manuelle Versionsanpassungen.
- **Der Ablauf:** Nachdem der Branch `release-v1.2.1` erstellt und das Paket erfolgreich veröffentlicht wurde, sollten Sie einen Pull Request öffnen, um `release-v1.2.1` in `main` zu integrieren. Dieser Pull Request enthält genau einen Commit: „chore: bump version to v1.2.1“. Es handelt sich um eine saubere, einfache Integration, die sicherstellt, dass Ihr `main`-Branch stets mit der zuletzt veröffentlichten Version synchron bleibt.

### NICHT in `main` zusammenführen bei Vorabversionen (RC, Beta, Dev)

Bei Vorabversionen führen Sie Release-Branches normalerweise nicht wieder in `main` zusammen.

- **Warum?** Vorabversionen (z. B. `v1.3.0-rc.1`, `v1.3.0-rc.2`) sind per Definition nicht stabil und nur vorübergehend. Sie möchten die Historie Ihres `main`-Branches nicht mit einer Reihe von Versionsanhebungen für Release-Kandidaten „verunreinigen“. Die Datei `package.json` in `main` sollte die neueste stabile Release-Version widerspiegeln – nicht eine RC-Version.
- **Der Ablauf:** Der Branch `release-v1.3.0-rc.1` wird erstellt, `npm publish --tag rc` ausgeführt – und danach hat der Branch seinen Zweck erfüllt. Sie können ihn einfach löschen. Der Code für die RC befindet sich bereits in `main` (oder einem Feature-Branch), sodass kein funktionaler Code verloren geht. Der Release-Branch war lediglich ein vorübergehendes Mittel, um die Versionsnummer zu verwalten.

## Lokales Testen und Validieren: Änderungen am Verpackungs- und Veröffentlichungsprozess

Falls Sie den Veröffentlichungsprozess testen möchten, ohne tatsächlich auf npm zu veröffentlichen oder eine öffentliche GitHub-Release zu erstellen, können Sie den Workflow manuell über die GitHub-Benutzeroberfläche auslösen.

1.  Wechseln Sie zur [Actions-Registerkarte](https://github.com/QwenLM/qwen-code/actions/workflows/release.yml) des Repositorys.
2.  Klicken Sie auf das Dropdown-Menü „Workflow ausführen“.
3.  Belassen Sie die Option `dry_run` aktiviert (`true`).
4.  Klicken Sie auf die Schaltfläche „Workflow ausführen“.

Dadurch wird der gesamte Veröffentlichungsprozess ausgeführt, wobei jedoch die Schritte `npm publish` und `gh release create` übersprungen werden. Sie können die Workflow-Protokolle überprüfen, um sicherzustellen, dass alles wie erwartet funktioniert.

Es ist unbedingt erforderlich, alle Änderungen am Verpackungs- und Veröffentlichungsprozess lokal zu testen, bevor Sie diese committen. Dadurch wird sichergestellt, dass die Pakete korrekt veröffentlicht werden und bei der Installation durch einen Benutzer wie erwartet funktionieren.

Um Ihre Änderungen zu validieren, können Sie einen „Dry Run“ des Veröffentlichungsprozesses durchführen. Dabei wird der Veröffentlichungsprozess simuliert, ohne die Pakete tatsächlich im npm-Registry zu veröffentlichen.

```bash
npm_package_version=9.9.9 SANDBOX_IMAGE_REGISTRY="registry" SANDBOX_IMAGE_NAME="thename" npm run publish:npm --dry-run
```

Dieser Befehl führt Folgendes aus:

1.  Erstellung aller Pakete.
2.  Ausführung aller Prepublish-Skripte.
3.  Erstellung der Paket-Tarballs, die ansonsten an npm veröffentlicht würden.
4.  Ausgabe einer Zusammenfassung der Pakete, die veröffentlicht würden.

Anschließend können Sie die generierten Tarballs überprüfen, um sicherzustellen, dass sie die richtigen Dateien enthalten und die `package.json`-Dateien korrekt aktualisiert wurden. Die Tarballs werden im Stammverzeichnis des jeweiligen Paketordners erstellt (z. B. `packages/cli/qwen-code-0.1.6.tgz`).

Durch den „Dry Run“ können Sie sicherstellen, dass Ihre Änderungen am Verpackungsprozess korrekt sind und die Pakete erfolgreich veröffentlicht werden.

## Tiefenanalyse der Veröffentlichung

Das Hauptziel des Veröffentlichungsprozesses besteht darin, den Quellcode aus dem Verzeichnis `packages/` zu nehmen, ihn zu kompilieren und daraus ein sauberes, eigenständiges Paket im temporären Verzeichnis `dist` im Projektstammverzeichnis zusammenzustellen. Dieses Verzeichnis `dist` wird tatsächlich in die NPM-Registry veröffentlicht.

Folgende Schlüsselphasen sind dabei zu unterscheiden:

Phase 1: Vorveröffentlichungs-Integritätsprüfungen und Versionsverwaltung

- Was passiert: Bevor Dateien verschoben werden, stellt der Prozess sicher, dass sich das Projekt in einem stabilen Zustand befindet. Dazu werden Tests ausgeführt, Linting durchgeführt und Typprüfungen vorgenommen (`npm run preflight`). Die Versionsnummer in der Datei `package.json` im Projektstammverzeichnis sowie in `packages/cli/package.json` wird auf die neue Release-Version aktualisiert.  
- Warum: Dadurch wird gewährleistet, dass ausschließlich qualitativ hochwertiger, funktionsfähiger Code veröffentlicht wird. Die Versionsnummerierung ist der erste Schritt, um eine neue Veröffentlichung offiziell zu kennzeichnen.

Phase 2: Kompilierung des Quellcodes

- Was passiert: Der TypeScript-Quellcode aus `packages/core/src` und `packages/cli/src` wird in JavaScript kompiliert.  
- Dateibewegung:  
  - `packages/core/src/**/*.ts` → kompiliert nach → `packages/core/dist/`  
  - `packages/cli/src/**/*.ts` → kompiliert nach → `packages/cli/dist/`  
- Warum: Der während der Entwicklung geschriebene TypeScript-Code muss in reines JavaScript umgewandelt werden, das von Node.js ausgeführt werden kann. Das Core-Paket wird zuerst kompiliert, da das CLI-Paket davon abhängt.

Phase 3: Bündelung und Zusammenstellung des endgültigen, veröffentlichbaren Pakets

Dies ist die kritischste Phase, in der Dateien verschoben und in ihren endgültigen Zustand für die Veröffentlichung transformiert werden. Der Prozess nutzt moderne Bundling-Techniken, um das finale Paket zu erzeugen.

1.  Erstellung des Bundles:  
    - Was passiert: Das Skript `prepare-package.js` erstellt ein sauberes Verteilungspaket im Verzeichnis `dist`.  
    - Wichtige Transformationen:  
      - Kopiert `README.md` und `LICENSE` nach `dist/`  
      - Kopiert den Ordner `locales` für die Internationalisierung  
      - Erstellt eine bereinigte `package.json` für die Verteilung mit nur den erforderlichen Abhängigkeiten  
      - Hält die Verteilungsabhängigkeiten minimal (keine eingebetteten Laufzeit-Abhängigkeiten)  
      - Behält optionale Abhängigkeiten für `node-pty` bei  

2.  Erstellung des JavaScript-Bundles:  
    - Was passiert: Der kompilierte JavaScript-Code aus `packages/core/dist` und `packages/cli/dist` wird mithilfe von `esbuild` zu einer einzigen, ausführbaren JavaScript-Datei gebündelt.  
    - Dateispeicherort: `dist/cli.js`  
    - Warum: Damit entsteht eine einzelne, optimierte Datei, die sämtlichen notwendigen Anwendungscode enthält. Dadurch wird das Paket vereinfacht, da zur Installationszeit keine komplexe Abhängigkeitsauflösung mehr erforderlich ist.  

3.  Kopieren statischer und unterstützender Dateien:  
    - Was passiert: Wesentliche Dateien, die nicht Teil des Quellcodes sind, aber für den korrekten Betrieb oder eine angemessene Beschreibung des Pakets erforderlich sind, werden in das Verzeichnis `dist` kopiert.  
    - Dateibewegung:  
      - `README.md` → `dist/README.md`  
      - `LICENSE` → `dist/LICENSE`  
      - `locales/` → `dist/locales/`  
      - Vendor-Dateien → `dist/vendor/`  
    - Warum:  
      - `README.md` und `LICENSE` sind Standarddateien, die in jedem NPM-Paket enthalten sein sollten.  
      - Der `locales`-Ordner unterstützt Internationalisierungsfunktionen.  
      - Vendor-Dateien enthalten erforderliche Laufzeit-Abhängigkeiten.  

Phase 4: Veröffentlichung in NPM

- Was passiert: Der Befehl `npm publish` wird innerhalb des Stammverzeichnisses `dist` ausgeführt.  
- Warum: Durch die Ausführung von `npm publish` aus dem Verzeichnis `dist` werden ausschließlich die Dateien hochgeladen, die in Phase 3 sorgfältig zusammengestellt wurden. Dadurch wird verhindert, dass versehentlich Quellcode, Testdateien oder Entwicklungs-Konfigurationen veröffentlicht werden – das Ergebnis ist ein sauberes und schlankes Paket für die Nutzer.  

Dieser Prozess stellt sicher, dass das endgültig veröffentlichte Artefakt eine gezielt erstellte, saubere und effiziente Darstellung des Projekts ist – und kein direkter Abbild des Entwicklungsarbeitsbereichs.

## NPM-Arbeitsbereiche

Dieses Projekt nutzt [NPM-Arbeitsbereiche](https://docs.npmjs.com/cli/v10/using-npm/workspaces), um die Pakete innerhalb dieses Monorepos zu verwalten. Dadurch wird die Entwicklung vereinfacht, da Abhängigkeiten verwaltet und Skripte über mehrere Pakete hinweg vom Projektstamm aus ausgeführt werden können.

### Funktionsweise

Die Stamm-`package.json`-Datei definiert die Arbeitsbereiche für dieses Projekt:

```json
{
  "workspaces": ["packages/*"]
}
```

Dies weist NPM an, dass jeder Ordner im Verzeichnis `packages` ein eigenständiges Paket ist, das als Teil des Arbeitsbereichs verwaltet werden soll.

### Vorteile von Workspaces

- **Vereinfachtes Dependency-Management**: Wenn Sie `npm install` im Stammverzeichnis des Projekts ausführen, werden alle Abhängigkeiten für sämtliche Pakete im Workspace installiert und miteinander verknüpft. Dadurch ist es nicht erforderlich, `npm install` in jedem einzelnen Paketverzeichnis auszuführen.
- **Automatische Verknüpfung**: Pakete innerhalb des Workspaces können voneinander abhängen. Bei Ausführung von `npm install` erstellt npm automatisch symbolische Links (Symlinks) zwischen den Paketen. Dadurch stehen Änderungen an einem Paket sofort anderen Paketen zur Verfügung, die davon abhängen.
- **Vereinfachte Skriptausführung**: Sie können Skripte aus beliebigen Paketen vom Stammverzeichnis des Projekts aus mit dem Flag `--workspace` ausführen. Um beispielsweise das `build`-Skript im Paket `cli` auszuführen, führen Sie `npm run build --workspace @qwen-code/qwen-code` aus.