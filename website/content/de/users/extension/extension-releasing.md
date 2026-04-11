# Veröffentlichung von Extensions

Es gibt drei primäre Möglichkeiten, Extensions für Nutzer zu veröffentlichen:

- [Git-Repository](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)
- [npm Registry](#releasing-through-npm-registry)

Veröffentlichungen über ein Git-Repository sind in der Regel die einfachste und flexibelste Methode. GitHub Releases können bei der Erstinstallation effizienter sein, da sie als einzelne Archive bereitgestellt werden, anstatt ein `git clone` zu erfordern, das jede Datei einzeln herunterlädt. GitHub Releases können zudem plattformspezifische Archive enthalten, falls du plattformspezifische Binärdateien ausliefern musst. Veröffentlichungen über die npm Registry sind ideal für Teams, die npm bereits für die Paketverteilung nutzen, insbesondere in Verbindung mit privaten Registries.

## Veröffentlichung über ein Git-Repository

Dies ist die flexibelste und einfachste Option. Du musst lediglich ein öffentlich zugängliches Git-Repository erstellen (z. B. ein öffentliches GitHub-Repository). Nutzer können deine Extension dann mit `qwen extensions install <your-repo-uri>` installieren. Für ein GitHub-Repository können sie das vereinfachte Format `qwen extensions install <org>/<repo>` verwenden. Optional kann über das Argument `--ref=<some-ref>` eine bestimmte Ref (Branch/Tag/Commit) angegeben werden. Standardmäßig wird der Default-Branch verwendet.

Sobald Commits auf die Ref gepusht werden, von der eine Installation abhängt, werden Nutzer zum Aktualisieren der Extension aufgefordert. Beachte, dass dies auch einfache Rollbacks ermöglicht: Der HEAD-Commit wird immer als neueste Version behandelt, unabhängig von der tatsächlichen Version in der `qwen-extension.json`-Datei.

### Verwaltung von Release-Channels über ein Git-Repository

Nutzer können von jeder Ref deines Git-Repositories abhängen, z. B. einem Branch oder Tag. So kannst du mehrere Release-Channels verwalten.

Du kannst beispielsweise einen `stable`-Branch pflegen, den Nutzer mit `qwen extensions install <your-repo-uri> --ref=stable` installieren können. Alternativ kannst du dies zum Standard machen, indem du deinen Default-Branch als Stable-Release-Branch nutzt und die Entwicklung in einem anderen Branch (z. B. `dev`) durchführst. Du kannst beliebig viele Branches oder Tags pflegen, was dir und deinen Nutzern maximale Flexibilität bietet.

Beachte, dass diese `ref`-Argumente Tags, Branches oder sogar spezifische Commits sein können. So können Nutzer von einer bestimmten Version deiner Extension abhängen. Wie du deine Tags und Branches verwaltest, liegt ganz bei dir.

### Beispielhafter Release-Workflow mit einem Git-Repository

Es gibt viele Möglichkeiten, Releases mit einem Git-Workflow zu verwalten. Wir empfehlen jedoch, deinen Default-Branch als „stable“-Release-Branch zu nutzen. Das bedeutet, dass `qwen extensions install <your-repo-uri>` standardmäßig auf dem Stable-Release-Branch installiert wird.

Angenommen, du möchtest drei Standard-Release-Channels pflegen: `stable`, `preview` und `dev`. Die gesamte Standardentwicklung findet im `dev`-Branch statt. Wenn ein Preview-Release bereitsteht, mergst du diesen Branch in deinen `preview`-Branch. Sobald der Preview-Branch stabil genug für ein Stable-Release ist, mergst du `preview` in deinen Stable-Branch (dies kann dein Default-Branch oder ein separater Branch sein).

Du kannst Änderungen auch mit `git cherry-pick` von einem Branch in einen anderen übernehmen. Beachte jedoch, dass dies zu leicht voneinander abweichenden Historien der Branches führt, es sei denn, du forcierst bei jedem Release einen Push, um die Historie wieder auf einen sauberen Stand zu bringen (was je nach Repository-Einstellungen für den Default-Branch nicht möglich sein kann). Wenn du Cherry-Picks planst, solltest du erwägen, den Default-Branch nicht als Stable-Branch zu verwenden, um Force-Pushes auf den Default-Branch zu vermeiden, was generell nicht empfohlen wird.

## Veröffentlichung über GitHub Releases

Qwen Code Extensions können über [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) verteilt werden. Dies bietet Nutzern eine schnellere und zuverlässigere Erstinstallation, da das Klonen des Repositories entfällt.

Jedes Release enthält mindestens eine Archivdatei, die den vollständigen Inhalt des Repositories zum verknüpften Tag umfasst. Releases können zudem [vorkompilierte Archive](#custom-pre-built-archives) enthalten, falls deine Extension einen Build-Schritt erfordert oder plattformspezifische Binärdateien beinhaltet.

Bei der Update-Prüfung sucht Qwen Code standardmäßig nach dem neuesten Release auf GitHub (du musst es beim Erstellen entsprechend markieren), es sei denn, der Nutzer hat ein bestimmtes Release durch Angabe von `--ref=<some-release-tag>` installiert. Die explizite Nutzung von Pre-Releases oder Semver wird derzeit nicht unterstützt.

### Benutzerdefinierte vorkompilierte Archive

Benutzerdefinierte Archive müssen als Assets direkt an das GitHub-Release angehängt werden und vollständig in sich geschlossen sein. Das bedeutet, sie müssen die gesamte Extension enthalten (siehe [Archivstruktur](#archive-structure)).

Wenn deine Extension plattformunabhängig ist, kannst du ein einzelnes generisches Asset bereitstellen. In diesem Fall sollte nur ein Asset am Release angehängt sein.

Benutzerdefinierte Archive eignen sich auch, wenn du deine Extension innerhalb eines größeren Repositories entwickelst. Du kannst ein Archiv erstellen, das eine andere Struktur als das Repository selbst aufweist (z. B. nur ein Archiv eines Unterverzeichnisses, das die Extension enthält).

#### Plattformspezifische Archive

Damit Qwen Code das korrekte Release-Asset für jede Plattform automatisch finden kann, musst du folgende Namenskonvention einhalten. Die CLI sucht Assets in dieser Reihenfolge:

1.  **Plattform- und Architektur-spezifisch:** `{platform}.{arch}.{name}.{extension}`
2.  **Plattform-spezifisch:** `{platform}.{name}.{extension}`
3.  **Generisch:** Wenn nur ein Asset bereitgestellt wird, wird dies als generischer Fallback verwendet.

- `{name}`: Der Name deiner Extension.
- `{platform}`: Das Betriebssystem. Unterstützte Werte sind:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: Die Architektur. Unterstützte Werte sind:
  - `x64`
  - `arm64`
- `{extension}`: Die Dateiendung des Archivs (z. B. `.tar.gz` oder `.zip`).

**Beispiele:**

- `darwin.arm64.my-tool.tar.gz` (spezifisch für Apple-Silicon-Macs)
- `darwin.my-tool.tar.gz` (für alle Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archivstruktur

Archive müssen vollständig enthaltene Extensions sein und alle Standardanforderungen erfüllen. Insbesondere muss sich die `qwen-extension.json`-Datei im Root-Verzeichnis des Archivs befinden.

Der Rest der Struktur sollte exakt einer typischen Extension entsprechen, siehe [extensions.md](extension.md).

#### Beispielhafter GitHub Actions Workflow

Hier ist ein Beispiel für einen GitHub Actions Workflow, der eine Qwen Code Extension für mehrere Plattformen baut und veröffentlicht:

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
          node-version: '20'

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

## Veröffentlichung über die npm Registry

Du kannst Qwen Code Extensions als scoped npm-Pakete veröffentlichen (z. B. `@your-org/my-extension`). Dies ist ideal, wenn:

- dein Team npm bereits für die Paketverteilung nutzt
- du Support für private Registries mit bestehender Auth-Infrastruktur benötigst
- du die Versionsauflösung und Zugriffskontrolle von npm übernehmen lassen möchtest

### Paketanforderungen

Dein npm-Paket muss eine `qwen-extension.json`-Datei im Paket-Root enthalten. Dies ist dieselbe Konfigurationsdatei, die von allen Qwen Code Extensions verwendet wird – das npm-Tarball ist lediglich ein weiterer Verteilungsmechanismus.

Eine minimale Paketstruktur sieht wie folgt aus:

```
my-extension/
├── package.json
├── qwen-extension.json
├── QWEN.md              # optional context file
├── commands/             # optional custom commands
├── skills/               # optional custom skills
└── agents/               # optional custom subagents
```

Stelle sicher, dass `qwen-extension.json` in deinem veröffentlichten Paket enthalten ist (d. h. nicht durch `.npmignore` oder das `files`-Feld in `package.json` ausgeschlossen wird).

### Veröffentlichung

Verwende die standardmäßigen npm-Veröffentlichungstools:

```bash
# Publish to the default registry
npm publish

# Publish to a private/custom registry
npm publish --registry https://your-registry.com
```

### Installation

Nutzer installieren deine Extension mit dem scoped Paketnamen:

```bash
# Install latest version
qwen extensions install @your-org/my-extension

# Install a specific version
qwen extensions install @your-org/my-extension@1.2.0

# Install from a custom registry
qwen extensions install @your-org/my-extension --registry https://your-registry.com
```

### Update-Verhalten

- Extensions, die ohne Version-Pin installiert werden (z. B. `@scope/pkg`), folgen dem `latest`-dist-tag.
- Extensions, die mit einem dist-tag installiert werden (z. B. `@scope/pkg@beta`), folgen diesem spezifischen Tag.
- Extensions, die auf eine exakte Version gepinnt sind (z. B. `@scope/pkg@1.2.0`), gelten immer als aktuell und fordern keine Updates an.

### Authentifizierung für private Registries

Qwen Code liest npm-Authentifizierungsdaten automatisch aus:

1. **`NPM_TOKEN`-Umgebungsvariable** — höchste Priorität
2. **`.npmrc`-Datei** — unterstützt sowohl hostweite als auch pfadbezogene `_authToken`-Einträge (z. B. `//your-registry.com/:_authToken=TOKEN` oder `//pkgs.dev.azure.com/org/_packaging/feed/npm/registry/:_authToken=TOKEN`)

`.npmrc`-Dateien werden aus dem aktuellen Verzeichnis und dem Home-Verzeichnis des Nutzers gelesen.

### Verwaltung von Release-Channels

Du kannst npm dist-tags zur Verwaltung von Release-Channels nutzen:

```bash
# Publish a beta release
npm publish --tag beta

# Users install beta channel
qwen extensions install @your-org/my-extension@beta
```

Dies funktioniert ähnlich wie git-branch-basierte Release-Channels, nutzt jedoch den nativen dist-tag-Mechanismus von npm.