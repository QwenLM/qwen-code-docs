# Veröffentlichung von Erweiterungen

Es gibt drei primäre Methoden, um Erweiterungen für Benutzer zu veröffentlichen:

- [Git-Repository](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [npm-Registry](#releasing-through-npm-registry)

Veröffentlichungen über ein Git-Repository sind in der Regel der einfachste und flexibelste Ansatz, während GitHub-Releases bei der Erstinstallation effizienter sein können, da sie als einzelne Archive ausgeliefert werden, anstatt einen Git-Clone zu erfordern, der jede Datei einzeln herunterlädt. GitHub-Releases können auch plattformspezifische Archive enthalten, falls Sie plattformspezifische Binärdateien ausliefern müssen. Veröffentlichungen über die npm-Registry sind ideal für Teams, die bereits npm zur Paketverteilung nutzen, insbesondere mit privaten Registries.

## Veröffentlichung über ein Git-Repository

Dies ist die flexibelste und einfachste Option. Sie müssen lediglich ein öffentlich zugängliches Git-Repo erstellen (z. B. ein öffentliches GitHub-Repository), und Benutzer können Ihre Erweiterung mit `qwen extensions install <ihr-repo-uri>` installieren. Für ein GitHub-Repository können sie das vereinfachte Format `qwen extensions install <org>/<repo>` verwenden. Optional können sie mit dem Argument `--ref=<some-ref>` einen bestimmten Ref (Branch/Tag/Commit) angeben; standardmäßig wird der Standard-Branch verwendet.

Wenn Commits in den Ref gepusht werden, von dem ein Benutzer abhängt, wird er aufgefordert, die Erweiterung zu aktualisieren. Beachten Sie, dass dies auch einfache Rollbacks ermöglicht – der HEAD-Commit wird unabhängig von der tatsächlichen Version in der `qwen-extension.json` immer als neueste Version betrachtet.

### Verwaltung von Release-Kanälen mit einem Git-Repository

Benutzer können von jedem Ref Ihres Git-Repos abhängen, z. B. einem Branch oder Tag, sodass Sie mehrere Release-Kanäle verwalten können.

Sie können beispielsweise einen `stable`-Branch pflegen, den Benutzer mit `qwen extensions install <ihr-repo-uri> --ref=stable` installieren können. Oder Sie könnten dies zum Standard machen, indem Sie Ihren Standard-Branch als Stable-Release-Branch behandeln und die Entwicklung in einem anderen Branch (z. B. `dev`) durchführen. Sie können beliebig viele Branches oder Tags verwalten, was maximale Flexibilität für Sie und Ihre Benutzer bietet.

Beachten Sie, dass diese `ref`-Argumente Tags, Branches oder sogar bestimmte Commits sein können, sodass Benutzer von einer bestimmten Version Ihrer Erweiterung abhängen können. Es liegt an Ihnen, wie Sie Ihre Tags und Branches verwalten möchten.

### Beispiel-Release-Ablauf mit einem Git-Repo

Es gibt viele Möglichkeiten, Releases mit einem Git-Workflow zu verwalten. Wir empfehlen, Ihren Standard-Branch als „Stable“-Release-Branch zu behandeln. Das bedeutet, dass das Standardverhalten für `qwen extensions install <ihr-repo-uri>` darin besteht, den Stable-Release-Branch zu verwenden.

Angenommen, Sie möchten drei Standard-Release-Kanäle verwalten: `stable`, `preview` und `dev`. Dann würden Sie die gesamte normale Entwicklung im `dev`-Branch durchführen. Wenn Sie bereit für ein Preview-Release sind, mergen Sie diesen Branch in Ihren `preview`-Branch. Wenn Sie bereit sind, Ihren Preview-Branch auf Stable zu heben, mergen Sie `preview` in Ihren Stable-Branch (der Ihr Standard-Branch oder ein anderer Branch sein kann).

Sie können auch mit `git cherry-pick` einzelne Änderungen von einem Branch in einen anderen übernehmen. Beachten Sie jedoch, dass dies dazu führt, dass Ihre Branches eine leicht abweichende Historie voneinander haben, es sei denn, Sie erzwingen bei jedem Release Änderungen auf Ihre Branches, um die Historie auf einen sauberen Zustand zurückzusetzen (was für den Standard-Branch je nach Repository-Einstellungen möglicherweise nicht möglich ist). Wenn Sie Cherry-Picks planen, sollten Sie vermeiden, dass Ihr Standard-Branch der Stable-Branch ist, um Force-Pushes auf den Standard-Branch zu vermeiden, was generell vermieden werden sollte.

## Veröffentlichung über GitHub Releases

Qwen Code-Erweiterungen können über [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) verteilt werden. Dies bietet Benutzern eine schnellere und zuverlässigere Erstinstallation, da ein Klonen des Repositorys vermieden wird.

Jedes Release enthält mindestens eine Archivdatei, die den vollständigen Inhalt des Repos zum Zeitpunkt des zugehörigen Tags enthält. Releases können auch [vorgefertigte Archive](#custom-pre-built-archives) enthalten, wenn Ihre Erweiterung einen Build-Schritt erfordert oder plattformspezifische Binärdateien mitliefert.

Bei der Überprüfung auf Updates sucht Qwen Code nach dem neuesten Release auf GitHub (Sie müssen es beim Erstellen des Releases als solches markieren), es sei denn, der Benutzer hat ein bestimmtes Release mit `--ref=<some-release-tag>` installiert. Wir unterstützen derzeit kein Opt-in für Pre-Release-Releases oder Semver.

### Benutzerdefinierte vorgefertigte Archive

Benutzerdefinierte Archive müssen direkt als Assets an das GitHub-Release angehängt werden und vollständig in sich geschlossen sein. Das bedeutet, sie sollten die gesamte Erweiterung enthalten, siehe [Archivstruktur](#archive-structure).

Wenn Ihre Erweiterung plattformunabhängig ist, können Sie ein einzelnes generisches Asset bereitstellen. In diesem Fall sollte dem Release nur ein Asset beigefügt sein.

Benutzerdefinierte Archive können auch verwendet werden, wenn Sie Ihre Erweiterung innerhalb eines größeren Repositorys entwickeln möchten. Sie können ein Archiv erstellen, das ein anderes Layout als das Repo selbst hat (z. B. ein Archiv eines Unterverzeichnisses, das die Erweiterung enthält).

#### Plattformspezifische Archive

Damit Qwen Code das richtige Release-Asset für jede Plattform automatisch finden kann, müssen Sie diese Namenskonvention einhalten. Die CLI sucht nach Assets in der folgenden Reihenfolge:

1. **Plattform- und Architektur-spezifisch:** `{platform}.{arch}.{name}.{extension}`
2. **Plattform-spezifisch:** `{platform}.{name}.{extension}`
3. **Generisch:** Wenn nur ein Asset bereitgestellt wird, wird es als generischer Fallback verwendet.

- `{name}`: Der Name Ihrer Erweiterung.
- `{platform}`: Das Betriebssystem. Unterstützte Werte sind:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: Die Architektur. Unterstützte Werte sind:
  - `x64`
  - `arm64`
- `{extension}`: Die Dateierweiterung des Archivs (z. B. `.tar.gz` oder `.zip`).

**Beispiele:**

- `darwin.arm64.my-tool.tar.gz` (spezifisch für Apple Silicon Macs)
- `darwin.my-tool.tar.gz` (für alle Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archivstruktur

Archive müssen vollständig in sich geschlossene Erweiterungen sein und alle Standardanforderungen erfüllen – insbesondere muss sich die `qwen-extension.json`-Datei im Stammverzeichnis des Archivs befinden.

Der Rest des Layouts sollte genau wie eine typische Erweiterung aussehen, siehe [introduction.md](./introduction.md).

#### Beispiel GitHub Actions-Workflow

Hier ist ein Beispiel für einen GitHub Actions-Workflow, der eine Qwen Code-Erweiterung für mehrere Plattformen erstellt und veröffentlicht:

```yaml
name: Release Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '22'

      - name: Install dependencies
        run: npm ci

      - name: Build extension
        run: npm run build

      - name: Create release assets
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```

## Veröffentlichung über die npm-Registry

Sie können Qwen Code-Erweiterungen als gescopte npm-Pakete veröffentlichen (z. B. `@your-org/my-extension`). Dies ist eine gute Wahl, wenn:

- Ihr Team bereits npm zur Paketverteilung verwendet
- Sie Unterstützung für private Registries mit vorhandener Authentifizierungsinfrastruktur benötigen
- Sie die Versionsauflösung und Zugriffskontrolle von npm nutzen möchten

### Paketanforderungen

Ihr npm-Paket muss eine `qwen-extension.json`-Datei im Paketstammverzeichnis enthalten. Dies ist dieselbe Konfigurationsdatei, die von allen Qwen Code-Erweiterungen verwendet wird – der npm-Tarball ist lediglich ein anderer Auslieferungsmechanismus.

Eine minimale Paketstruktur sieht wie folgt aus:

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # optionale Kontextdatei
├── commands/             # optionale benutzerdefinierte Befehle
├── skills/               # optionale benutzerdefinierte Fähigkeiten
└── agents/               # optionale benutzerdefinierte Unteragenten
```

Stellen Sie sicher, dass `qwen-extension.json` in Ihrem veröffentlichten Paket enthalten ist (d. h. nicht durch `.npmignore` oder das `files`-Feld in `package.json` ausgeschlossen wird).

### Veröffentlichen

Verwenden Sie die standardmäßigen npm-Veröffentlichungswerkzeuge:

```bash
# Veröffentlichen in der Standard-Registry
npm publish

# Veröffentlichen in einer privaten/benutzerdefinierten Registry
npm publish --registry https://your-registry.com
```

### Installation

Benutzer installieren Ihre Erweiterung mit dem gescopten Paketnamen:

```bash
# Neueste Version installieren
qwen extensions install @your-org/my-extension

# Bestimmte Version installieren
qwen extensions install @your-org/my-extension@1.2.0

# Von einer benutzerdefinierten Registry installieren
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### Update-Verhalten

- Erweiterungen, die ohne Version-Pin installiert wurden (z. B. `@scope/pkg`), folgen dem `latest`-Dist-Tag.
- Erweiterungen, die mit einem Dist-Tag installiert wurden (z. B. `@scope/pkg@beta`), folgen diesem spezifischen Tag.
- Erweiterungen, die auf eine exakte Version festgelegt sind (z. B. `@scope/pkg@1.2.0`), werden immer als aktuell betrachtet und nicht zur Aktualisierung aufgefordert.

### Authentifizierung für private Registries

Qwen Code liest npm-Auth-Anmeldedaten automatisch aus:

1. **Umgebungsvariable `NPM_TOKEN`** – höchste Priorität
2. **`.npmrc`-Datei** – unterstützt sowohl host-level als auch pfadbezogene `_authToken`-Einträge (z. B. `//your-registry.com/:_authToken=TOKEN` oder `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

`.npmrc`-Dateien werden aus dem aktuellen Verzeichnis und dem Home-Verzeichnis des Benutzers gelesen.

### Verwaltung von Release-Kanälen

Sie können npm-Dist-Tags zur Verwaltung von Release-Kanälen verwenden:

```bash
# Beta-Release veröffentlichen
npm publish --tag beta

# Benutzer installieren den Beta-Kanal
qwen extensions install @your-org/my-extension@beta
```

Dies funktioniert ähnlich wie git-branchbasierte Release-Kanäle, verwendet jedoch den nativen Dist-Tag-Mechanismus von npm.