# Erweiterungen veröffentlichen

Es gibt zwei Hauptmöglichkeiten, Erweiterungen für Benutzer freizugeben:

- [Git-Repository](#veröffentlichung-über-ein-git-repository)
- [GitHub-Releases](#veröffentlichung-über-github-releases)

Veröffentlichungen über ein Git-Repository sind in der Regel der einfachste und flexibelste Ansatz, während GitHub-Releases bei der ersten Installation effizienter sein können, da sie als einzelne Archive ausgeliefert werden, anstatt einen Git-Clone zu erfordern, der jede Datei einzeln herunterlädt. GitHub-Releases können auch plattformspezifische Archive enthalten, wenn Sie plattformspezifische Binärdateien ausliefern müssen.

## Veröffentlichen über ein Git-Repository

Dies ist die flexibelste und einfachste Option. Alles, was Sie tun müssen, ist ein öffentlich zugängliches Git-Repository zu erstellen (z. B. ein öffentliches GitHub-Repository). Anschließend können Benutzer Ihre Erweiterung mit `qwen extensions install <ihre-repo-uri>` installieren oder im Falle eines GitHub-Repositories das vereinfachte Format `qwen extensions install <org>/<repo>` verwenden. Optional kann eine spezifische Referenz (Branch/Tag/Commit) mittels des Arguments `--ref=<irgendeine-ref>` angegeben werden. Standardmäßig wird hierbei der Default-Branch verwendet.

Immer wenn Commits auf die Referenz gepusht werden, von der ein Benutzer abhängt, wird dieser zur Aktualisierung der Erweiterung aufgefordert. Beachten Sie, dass dies auch einfache Rollbacks ermöglicht: Das HEAD-Commit wird immer als neueste Version behandelt, unabhängig von der tatsächlichen Version in der Datei `qwen-extension.json`.

### Verwaltung von Release-Kanälen mithilfe eines Git-Repositorys

Benutzer können von jedem beliebigen Ref aus Ihrem Git-Repository abhängen, z. B. einem Branch oder Tag. Dies ermöglicht Ihnen die Verwaltung mehrerer Release-Kanäle.

Sie können beispielsweise einen `stable`-Branch pflegen, den Benutzer wie folgt installieren können: `qwen extensions install <your-repo-uri> --ref=stable`. Alternativ können Sie dies als Standard festlegen, indem Sie Ihren Standard-Branch als stabilen Release-Branch behandeln und die Entwicklung in einem anderen Branch durchführen (zum Beispiel `dev`). Sie können beliebig viele Branches oder Tags verwalten und bieten so maximale Flexibilität für Sie und Ihre Benutzer.

Beachten Sie, dass diese `ref`-Argumente Tags, Branches oder sogar spezifische Commits sein können, wodurch Benutzer von einer bestimmten Version Ihrer Erweiterung abhängen können. Wie Sie Ihre Tags und Branches verwalten möchten, bleibt Ihnen überlassen.

### Beispiel für einen Release-Workflow mit einem Git-Repository

Obwohl es viele Möglichkeiten gibt, wie Sie Releases mithilfe eines Git-Workflows verwalten möchten, empfehlen wir, Ihren Standardbranch als Ihren „stabilen“ Release-Branch zu behandeln. Das bedeutet, dass das Standardverhalten für `qwen extensions install <your-repo-uri>` darin besteht, den stabilen Release-Branch zu verwenden.

Angenommen, Sie möchten drei Standard-Release-Kanäle pflegen: `stable`, `preview` und `dev`. Dann würden Sie Ihre gesamte Standardentwicklung im Branch `dev` durchführen. Wenn Sie bereit sind, eine Vorschauversion (Preview) zu veröffentlichen, mergen Sie diesen Branch in Ihren `preview`-Branch. Wenn Sie dann Ihre Preview-Version in den stabilen Branch übernehmen möchten, mergen Sie `preview` in Ihren stabilen Branch (welcher Ihr Standard-Branch oder ein anderer Branch sein kann).

Sie können auch Änderungen von einem Branch in einen anderen mittels `git cherry-pick` übernehmen. Beachten Sie jedoch, dass dies dazu führen wird, dass sich die Historien Ihrer Branches leicht voneinander unterscheiden, es sei denn, Sie forcieren Ihre Branches bei jedem Release per `force push`, um die Historie wieder auf einen sauberen Zustand zurückzusetzen (was je nach Repository-Einstellungen für den Standard-Branch möglicherweise nicht möglich ist). Falls Sie planen, Cherry-Picks zu verwenden, sollten Sie vermeiden, den Standard-Branch als stabilen Branch zu nutzen, um das Force-Pushen auf den Standard-Branch zu vermeiden, was generell vermieden werden sollte.

## Veröffentlichung über GitHub-Releases

Qwen Code-Erweiterungen können über [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) verteilt werden. Dies bietet Benutzern eine schnellere und zuverlässigere Installationsmöglichkeit, da der Klonvorgang des Repositorys entfällt.

Jede Veröffentlichung enthält mindestens eine Archivdatei, die den vollständigen Inhalt des Repositorys zum Zeitpunkt des zugehörigen Tags enthält. Releases können außerdem [vorgefertigte Archive](#benutzerdefinierte-vorgefertigte-archive) enthalten, falls Ihre Erweiterung einen Build-Schritt erfordert oder plattformspezifische Binärdateien beinhaltet.

Beim Suchen nach Updates sucht qwen code standardmäßig nach der neuesten Veröffentlichung auf GitHub (Sie müssen diese als solche markieren, wenn Sie das Release erstellen), es sei denn, der Benutzer hat ein bestimmtes Release installiert, indem er `--ref=<ein-release-tag>` übergibt. Zurzeit unterstützen wir keine Vorabversionen oder SemVer.

### Benutzerdefinierte vorgefertigte Archive

Benutzerdefinierte Archive müssen direkt als Assets an die GitHub-Veröffentlichung angehängt werden und vollständig eigenständig sein. Das bedeutet, dass sie die gesamte Erweiterung enthalten sollten, siehe [Archivstruktur](#archive-structure).

Wenn Ihre Erweiterung plattformunabhängig ist, können Sie ein einzelnes generisches Asset bereitstellen. In diesem Fall sollte nur ein Asset an die Veröffentlichung angehängt werden.

Benutzerdefinierte Archive können auch verwendet werden, wenn Sie Ihre Erweiterung innerhalb eines größeren Repositorys entwickeln möchten. Sie können ein Archiv erstellen, das eine andere Struktur als das Repository selbst hat (zum Beispiel könnte es einfach ein Archiv eines Unterverzeichnisses sein, das die Erweiterung enthält).

#### Plattformspezifische Archive

Um sicherzustellen, dass Qwen Code automatisch das richtige Release-Asset für jede Plattform finden kann, müssen Sie diese Namenskonvention befolgen. Die CLI sucht nach Assets in der folgenden Reihenfolge:

1.  **Plattform- und Architekturspezifisch:** `{platform}.{arch}.{name}.{extension}`
2.  **Plattformspezifisch:** `{platform}.{name}.{extension}`
3.  **Generisch:** Wenn nur ein Asset bereitgestellt wird, wird es als generischer Ersatz verwendet.

- `{name}`: Der Name Ihrer Erweiterung.
- `{platform}`: Das Betriebssystem. Unterstützte Werte sind:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: Die Architektur. Unterstützte Werte sind:
  - `x64`
  - `arm64`
- `{extension}`: Die Dateierweiterung des Archives (z.B. `.tar.gz` oder `.zip`).

**Beispiele:**

- `darwin.arm64.my-tool.tar.gz` (spezifisch für Apple Silicon Macs)
- `darwin.my-tool.tar.gz` (für alle Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archivstruktur

Archive müssen vollständig enthaltene Erweiterungen sein und alle Standardanforderungen erfüllen – insbesondere muss sich die Datei `qwen-extension.json` im Stammverzeichnis des Archivs befinden.

Der Rest der Struktur sollte genau wie bei einer typischen Erweiterung aussehen, siehe [extensions.md](extension.md).

#### Beispiel-GitHub-Actions-Workflow

Hier ist ein Beispiel für einen GitHub-Actions-Workflow, der eine Qwen Code-Erweiterung für mehrere Plattformen erstellt und veröffentlicht:

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

      - name: Node.js einrichten
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Abhängigkeiten installieren
        run: npm ci

      - name: Erweiterung bauen
        run: npm run build

      - name: Release-Assets erstellen
        run: |
          npm run package -- --platform=darwin --arch=arm64
          npm run package -- --platform=linux --arch=x64
          npm run package -- --platform=win32 --arch=x64

      - name: GitHub-Release erstellen
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```