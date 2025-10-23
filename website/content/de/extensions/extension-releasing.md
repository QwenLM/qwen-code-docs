# Extension Releasing

Es gibt zwei primäre Möglichkeiten, Extensions an Benutzer zu veröffentlichen:

- [Git repository](#releasing-through-a-git-repository)
- [GitHub Releases](#releasing-through-github-releases)

Git repository Releases sind in der Regel der einfachste und flexibelste Ansatz, während GitHub Releases beim ersten Install effizienter sein können, da sie als einzelne Archive ausgeliefert werden, anstatt einen git clone zu erfordern, der jede Datei einzeln herunterlädt. GitHub Releases können auch plattformspezifische Archive enthalten, falls du plattformspezifische Binary-Dateien ausliefern musst.

## Veröffentlichen über ein Git-Repository

Dies ist die flexibelste und einfachste Option. Alles, was du tun musst, ist ein öffentlich zugängliches Git-Repo zu erstellen (z. B. ein öffentliches GitHub-Repository), und dann können Benutzer deine Erweiterung mit `qwen extensions install <your-repo-uri>` installieren. Bei einem GitHub-Repository können sie auch das vereinfachte Format `qwen extensions install <org>/<repo>` verwenden. Optional können sie sich auf einen bestimmten Ref (Branch/Tag/Commit) mithilfe des Arguments `--ref=<some-ref>` beziehen. Standardmäßig wird der Default-Branch verwendet.

Immer wenn Commits in den Ref gepusht werden, von dem ein Benutzer abhängt, wird er aufgefordert, die Erweiterung zu aktualisieren. Beachte, dass dies auch einfache Rollbacks ermöglicht: Der HEAD-Commit wird immer als neueste Version behandelt, unabhängig von der tatsächlichen Version in der Datei `qwen-extension.json`.

### Verwalten von Release-Kanälen mithilfe eines Git-Repositorys

Benutzer können von jedem Ref aus deinem Git-Repo abhängen, z. B. von einem Branch oder Tag. Dadurch kannst du mehrere Release-Kanäle verwalten.

Beispielsweise kannst du einen `stable`-Branch pflegen, den Benutzer wie folgt installieren können:  
`qwen extensions install <your-repo-uri> --ref=stable`.  

Oder du machst dies zum Standardverhalten, indem du deinen Standard-Branch als stabilen Release-Branch behandelst und die Entwicklung in einem anderen Branch (z. B. `dev`) durchführst. Du kannst beliebig viele Branches oder Tags pflegen und so maximale Flexibilität für dich und deine Benutzer bieten.

Beachte, dass diese `ref`-Argumente Tags, Branches oder sogar spezifische Commits sein können. Dadurch können Benutzer von einer bestimmten Version deiner Erweiterung abhängen. Wie du deine Tags und Branches verwaltest, bleibt dir überlassen.

### Beispiel für einen Release-Flow mit einem Git-Repo

Es gibt viele Möglichkeiten, wie du Releases mit einem Git-Flow verwalten kannst. Wir empfehlen jedoch, deinen Default-Branch als „stabilen“ Release-Branch zu behandeln. Das bedeutet, dass das Standardverhalten für `qwen extensions install <your-repo-uri>` auf dem stabilen Release-Branch liegt.

Angenommen, du möchtest drei Standard-Release-Kanäle pflegen: `stable`, `preview` und `dev`. Dann würdest du deine gesamte reguläre Entwicklung im `dev`-Branch durchführen. Wenn du bereit bist, eine Preview-Version zu veröffentlichen, mergest du diesen Branch in deinen `preview`-Branch. Sobald du den Preview-Branch zu einer stabilen Version machen willst, führst du einen Merge von `preview` in deinen Stable-Branch durch (das kann entweder dein Default-Branch sein oder ein anderer Branch).

Du kannst auch Änderungen selektiv von einem Branch in einen anderen übernehmen, indem du `git cherry-pick` nutzt. Beachte dabei jedoch, dass dadurch die Historie der einzelnen Branches leicht voneinander abweichen wird – es sei denn, du forcierst bei jedem Release einen Push auf die jeweiligen Branches, um die History wieder auf einen sauberen Stand zurückzusetzen (was je nach Repository-Einstellungen möglicherweise beim Default-Branch nicht erlaubt ist). Falls du Cherry-Picking einsetzen willst, solltest du daher vielleicht darauf verzichten, deinen Default-Branch direkt als Stable-Branch zu verwenden, um Force-Pushes auf den Default-Branch zu vermeiden – was generell nicht ratsam ist.

## Veröffentlichen über GitHub Releases

Qwen Code Erweiterungen können über [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) verteilt werden. Dies bietet eine schnellere und zuverlässigere Erfahrung für die initiale Installation, da das Klonen des Repositories vermieden wird.

Jedes Release enthält mindestens eine Archivdatei, welche den vollständigen Inhalt des Repos zum Zeitpunkt des entsprechenden Tags enthält. Releases können auch [vorab erstellte Archive](#custom-pre-built-archives) enthalten, falls deine Erweiterung einen Build-Schritt benötigt oder plattformspezifische Binärdateien beinhaltet.

Beim Prüfen auf Updates sucht Qwen Code einfach nach dem neuesten Release auf GitHub (du musst es beim Erstellen des Releases entsprechend markieren), es sei denn, der Benutzer hat ein bestimmtes Release installiert, indem er `--ref=<some-release-tag>` angibt. Derzeit unterstützen wir keine Option für Vorab-Releases (pre-release) oder SemVer.

### Benutzerdefinierte vorab erstellte Archive

Benutzerdefinierte Archive müssen direkt als Assets an das GitHub-Release angehängt werden und müssen vollständig eigenständig sein. Das bedeutet, sie sollten die gesamte Extension enthalten, siehe [Archivstruktur](#archive-structure).

Wenn Ihre Extension plattformunabhängig ist, können Sie ein einzelnes generisches Asset bereitstellen. In diesem Fall sollte nur ein Asset an das Release angehängt sein.

Benutzerdefinierte Archive können auch verwendet werden, wenn Sie Ihre Extension innerhalb eines größeren Repositorys entwickeln möchten. Sie können dann ein Archive erstellen, das eine andere Struktur aufweist als das Repository selbst (z. B. könnte es sich nur um ein Archive eines Unterverzeichnisses handeln, das die Extension enthält).

#### Plattformspezifische Archive

Um sicherzustellen, dass Qwen Code automatisch das richtige Release-Asset für jede Plattform finden kann, musst du diese Namenskonvention einhalten. Die CLI sucht in der folgenden Reihenfolge nach Assets:

1.  **Plattform- und Architekturspezifisch:** `{platform}.{arch}.{name}.{extension}`
2.  **Plattformspezifisch:** `{platform}.{name}.{extension}`
3.  **Generisch:** Wenn nur ein Asset bereitgestellt wird, wird dieses als generischer Fallback verwendet.

- `{name}`: Der Name deiner Erweiterung.
- `{platform}`: Das Betriebssystem. Unterstützte Werte sind:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: Die Architektur. Unterstützte Werte sind:
  - `x64`
  - `arm64`
- `{extension}`: Die Dateierweiterung des Archives (z. B. `.tar.gz` oder `.zip`).

**Beispiele:**

- `darwin.arm64.my-tool.tar.gz` (spezifisch für Apple Silicon Macs)
- `darwin.my-tool.tar.gz` (für alle Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archivstruktur

Archive müssen vollständig eigenständige Extensions sein und alle Standardanforderungen erfüllen – insbesondere muss sich die Datei `qwen-extension.json` im Stammverzeichnis des Archives befinden.

Das restliche Layout sollte genau wie bei einer typischen Extension aussehen, siehe [extensions.md](extension.md).

#### Beispiel-GitHub Actions Workflow

Hier ist ein Beispiel für einen GitHub Actions Workflow, der eine Qwen Code-Erweiterung für mehrere Plattformen baut und released:

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