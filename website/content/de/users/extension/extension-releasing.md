# Erweiterungsveröffentlichung

Es gibt drei primäre Möglichkeiten, Erweiterungen für Benutzer zu veröffentlichen:

- [Git-Repository](#veröffentlichung-über-ein-git-repository)
- [GitHub Releases](#veröffentlichung-über-github-releases)
- [npm-Registry](#veröffentlichung-über-die-npm-registry)

Veröffentlichungen über ein Git-Repository sind in der Regel der einfachste und flexibelste Ansatz, während GitHub Releases bei der Erstinstallation effizienter sein können, da sie als einzelne Archive ausgeliefert werden und nicht als Git-Clone, bei dem jede Datei einzeln heruntergeladen wird. GitHub Releases können auch plattformspezifische Archive enthalten, falls Sie plattformspezifische Binärdateien ausliefern müssen. Veröffentlichungen über die npm-Registry sind ideal für Teams, die bereits npm für die Paketverteilung nutzen, insbesondere mit privaten Registries.

## Veröffentlichung über ein Git-Repository

Dies ist die flexibelste und einfachste Option. Sie müssen lediglich ein öffentlich zugängliches Git-Repo erstellen (z. B. ein öffentliches GitHub-Repository), und dann können Benutzer Ihre Erweiterung mit `qwen extensions install <Ihr-Repo-URI>` installieren. Für ein GitHub-Repository können sie auch das vereinfachte Format `qwen extensions install <org>/<repo>` verwenden. Optional können sie mit dem Argument `--ref=<eine-ref>` von einem bestimmten Ref (Branch/Tag/Commit) abhängen; standardmäßig wird der Standard-Branch verwendet.

Immer wenn Commits in den Ref gepusht werden, von dem ein Benutzer abhängt, wird er zum Aktualisieren der Erweiterung aufgefordert. Beachten Sie, dass dies auch einfache Rollbacks ermöglicht: Der HEAD-Commit wird immer als neueste Version behandelt, unabhängig von der tatsächlichen Version in der `qwen-extension.json`-Datei.

### Verwaltung von Release-Kanälen mit einem Git-Repository

Benutzer können von jedem Ref Ihres Git-Repos abhängen, z. B. einem Branch oder Tag, sodass Sie mehrere Release-Kanäle verwalten können.

Sie können beispielsweise einen `stable`-Branch pflegen, den Benutzer mit `qwen extensions install <Ihr-Repo-URI> --ref=stable` installieren können. Oder Sie könnten dies zum Standard machen, indem Sie Ihren Standard-Branch als Stable-Release-Branch behandeln und die Entwicklung in einem anderen Branch (z. B. `dev`) durchführen. Sie können so viele Branches oder Tags pflegen, wie Sie möchten, was maximale Flexibilität für Sie und Ihre Benutzer bietet.

Beachten Sie, dass diese `ref`-Argumente Tags, Branches oder sogar bestimmte Commits sein können, sodass Benutzer von einer bestimmten Version Ihrer Erweiterung abhängen können. Es liegt an Ihnen, wie Sie Ihre Tags und Branches verwalten möchten.

### Beispiel für einen Veröffentlichungsprozess mit einem Git-Repo

Obwohl es viele Möglichkeiten gibt, wie Sie Releases mit einem Git-Workflow verwalten möchten, empfehlen wir, Ihren Standard-Branch als "Stable"-Release-Branch zu behandeln. Dies bedeutet, dass das Standardverhalten von `qwen extensions install <Ihr-Repo-URI>` darin besteht, auf dem Stable-Release-Branch zu sein.

Angenommen, Sie möchten drei Standard-Release-Kanäle pflegen: `stable`, `preview` und `dev`. Sie würden die gesamte normale Entwicklung im `dev`-Branch durchführen. Wenn Sie bereit für ein Preview-Release sind, mergen Sie diesen Branch in Ihren `preview`-Branch. Wenn Sie bereit sind, Ihren Preview-Branch auf Stable zu heben, mergen Sie `preview` in Ihren Stable-Branch (der Ihr Standard-Branch oder ein anderer Branch sein kann).

Sie können auch mit `git cherry-pick` einzelne Änderungen von einem Branch in einen anderen übernehmen. Beachten Sie jedoch, dass Ihre Branches dadurch eine leicht unterschiedliche Historie haben, es sei denn, Sie pushen bei jedem Release Änderungen per Force-Push in Ihre Branches, um die Historie auf einen sauberen Zustand zurückzusetzen (was für den Standard-Branch je nach Repository-Einstellungen möglicherweise nicht möglich ist). Wenn Sie Cherry-Picks planen, sollten Sie es vermeiden, Ihren Standard-Branch als Stable-Branch zu verwenden, um Force-Pushes auf den Standard-Branch zu vermeiden, die generell vermieden werden sollten.

## Veröffentlichung über GitHub Releases

Qwen Code-Erweiterungen können über [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) verteilt werden. Dies bietet den Benutzern eine schnellere und zuverlässigere Erstinstallation, da das Klonen des Repositorys vermieden wird.

Jedes Release enthält mindestens eine Archivdatei, die den vollständigen Inhalt des Repositorys zu dem Tag enthält, mit dem es verknüpft ist. Releases können auch [vorgefertigte Archive](#benutzerdefinierte-vorgefertigte-archive) enthalten, wenn Ihre Erweiterung einen Build-Schritt erfordert oder plattformspezifische Binärdateien enthält.

Bei der Suche nach Updates sucht Qwen Code einfach nach dem neuesten Release auf GitHub (Sie müssen es beim Erstellen des Releases als solches markieren), es sei denn, der Benutzer hat ein bestimmtes Release mit `--ref=<ein-release-tag>` installiert. Derzeit unterstützen wir weder die Opt-in für Pre-Release-Releases noch Semver.

### Benutzerdefinierte vorgefertigte Archive

Benutzerdefinierte Archive müssen direkt als Assets an das GitHub-Release angehängt werden und müssen vollständig in sich geschlossen sein. Das bedeutet, sie sollten die gesamte Erweiterung enthalten, siehe [Archivstruktur](#archivstruktur).

Wenn Ihre Erweiterung plattformunabhängig ist, können Sie ein einzelnes generisches Asset bereitstellen. In diesem Fall sollte nur ein Asset an das Release angehängt sein.

Benutzerdefinierte Archive können auch verwendet werden, wenn Sie Ihre Erweiterung innerhalb eines größeren Repositorys entwickeln möchten. Sie können ein Archiv erstellen, das ein anderes Layout als das Repository selbst hat (z. B. könnte es nur ein Archiv eines Unterverzeichnisses sein, das die Erweiterung enthält).
#### Plattformspezifische Archive

Damit Qwen Code automatisch das richtige Release-Asset für jede Plattform finden kann, müssen Sie diese Namenskonvention befolgen. Die CLI sucht nach Assets in der folgenden Reihenfolge:

1.  **Plattform- und Architektur-spezifisch:** `{platform}.{arch}.{name}.{extension}`
2.  **Plattformspezifisch:** `{platform}.{name}.{extension}`
3.  **Generisch:** Wenn nur ein Asset bereitgestellt wird, wird es als generischer Fallback verwendet.

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

Archive müssen vollständig enthaltene Erweiterungen sein und alle Standardanforderungen erfüllen – insbesondere muss sich die Datei `qwen-extension.json` im Stammverzeichnis des Archivs befinden.

Der restliche Aufbau sollte exakt dem einer typischen Erweiterung entsprechen, siehe [introduction.md](./introduction.md).

#### Beispiel für einen GitHub Actions-Workflow

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

Sie können Qwen Code-Erweiterungen als gescopte npm-Pakete (z. B. `@your-org/my-extension`) veröffentlichen. Dies ist eine gute Wahl, wenn:

- Ihr Team bereits npm für die Paketverteilung verwendet
- Sie Unterstützung für eine private Registry mit vorhandener Authentifizierungsinfrastruktur benötigen
- Sie die Versionsauflösung und Zugriffskontrolle durch npm verwalten lassen möchten

### Paketanforderungen

Ihr npm-Paket muss eine Datei `qwen-extension.json` im Paketstammverzeichnis enthalten. Dies ist die gleiche Konfigurationsdatei, die von allen Qwen Code-Erweiterungen verwendet wird – der npm-Tarball ist lediglich ein anderer Auslieferungsmechanismus.

Eine minimale Paketstruktur sieht so aus:

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

### Veröffentlichung

Verwenden Sie die Standardwerkzeuge von npm:

```bash
# In die Standard-Registry veröffentlichen
npm publish

# In eine private/benutzerdefinierte Registry veröffentlichen
npm publish --registry https://your-registry.com
```

### Installation

Benutzer installieren Ihre Erweiterung mit dem gescopten Paketnamen:

```bash
# Aktuelle Version installieren
qwen extensions install @your-org/my-extension

# Eine bestimmte Version installieren
qwen extensions install @your-org/my-extension@1.2.0

# Von einer benutzerdefinierten Registry installieren
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### Aktualisierungsverhalten

- Erweiterungen, die ohne Versionseinschränkung installiert wurden (z. B. `@scope/pkg`), folgen dem `latest`-dist-tag.
- Erweiterungen, die mit einem dist-tag installiert wurden (z. B. `@scope/pkg@beta`), folgen diesem spezifischen Tag.
- Erweiterungen, die auf eine exakte Version festgelegt sind (z. B. `@scope/pkg@1.2.0`), gelten immer als aktuell und werden nicht zu Aktualisierungen aufgefordert.

### Authentifizierung für private Registries

Qwen Code liest npm-Authentifizierungsdaten automatisch aus:

1.  **`NPM_TOKEN`-Umgebungsvariable** – höchste Priorität
2.  **`.npmrc`-Datei** – unterstützt sowohl host-level als auch pfadbezogene `_authToken`-Einträge (z. B. `//your-registry.com/:_authToken=TOKEN` oder `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

`.npmrc`-Dateien werden aus dem aktuellen Verzeichnis und dem Benutzerverzeichnis gelesen.

### Verwaltung von Release-Kanälen

Sie können npm-dist-tags verwenden, um Release-Kanäle zu verwalten:

```bash
# Ein Beta-Release veröffentlichen
npm publish --tag beta

# Benutzer installieren den Beta-Kanal
qwen extensions install @your-org/my-extension@beta
```

Dies funktioniert ähnlich wie git-basierte Release-Kanäle, verwendet jedoch den nativen dist-tag-Mechanismus von npm.
