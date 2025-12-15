# Veröffentlichung von Erweiterungen

Es gibt zwei primäre Möglichkeiten, Erweiterungen für Benutzer zu veröffentlichen:

- [Git-Repository](#veröffentlichung-über-ein-git-repository)
- [GitHub-Releases](#veröffentlichung-über-github-releases)

Veröffentlichungen über ein Git-Repository sind in der Regel der einfachste und flexibelste Ansatz, während GitHub-Releases beim ersten Installieren effizienter sein können, da sie als einzelne Archive ausgeliefert werden, anstatt einen git clone zu erfordern, bei dem jede Datei einzeln heruntergeladen wird. GitHub-Releases können auch plattformspezifische Archive enthalten, falls Sie plattformspezifische Binärdateien ausliefern müssen.

## Veröffentlichen über ein Git-Repository

Dies ist die flexibelste und einfachste Option. Alles, was du tun musst, ist ein öffentlich zugängliches Git-Repo zu erstellen (z. B. ein öffentliches GitHub-Repository), und dann können Benutzer deine Erweiterung mit `qwen extensions install <your-repo-uri>` installieren. Bei einem GitHub-Repository können sie auch das vereinfachte Format `qwen extensions install <org>/<repo>` verwenden. Optional können sie sich auf einen bestimmten Ref (Branch/Tag/Commit) mithilfe des Arguments `--ref=<some-ref>` beziehen. Standardmäßig wird der Standard-Branch verwendet.

Immer wenn Commits in den Ref gepusht werden, von dem ein Benutzer abhängt, wird er aufgefordert, die Erweiterung zu aktualisieren. Beachte, dass dies auch einfache Rollbacks ermöglicht: Der HEAD-Commit wird immer als neueste Version behandelt, unabhängig von der tatsächlichen Version in der Datei `qwen-extension.json`.

### Verwalten von Release-Kanälen mithilfe eines Git-Repositories

Benutzer können von jedem Ref aus Ihrem Git-Repository abhängen, z. B. einem Branch oder Tag, was Ihnen die Verwaltung mehrerer Release-Kanäle ermöglicht.

Sie können beispielsweise einen `stable`-Branch pflegen, den Benutzer wie folgt installieren können: `qwen extensions install <your-repo-uri> --ref=stable`. Alternativ können Sie dies auch als Standard festlegen, indem Sie Ihren Standard-Branch als stabilen Release-Branch behandeln und die Entwicklung in einem anderen Branch durchführen (z. B. einem namens `dev`). Sie können beliebig viele Branches oder Tags pflegen und bieten dadurch maximale Flexibilität für sich und Ihre Benutzer.

Beachten Sie, dass diese `ref`-Argumente Tags, Branches oder sogar bestimmte Commits sein können, wodurch Benutzer von einer spezifischen Version Ihrer Erweiterung abhängen können. Wie Sie Ihre Tags und Branches verwalten möchten, bleibt Ihnen überlassen.

### Beispiel für einen Release-Flow unter Verwendung eines Git-Repositories

Es gibt zwar viele Möglichkeiten, wie du Releases mit einem Git-Workflow verwalten kannst, aber wir empfehlen, deinen Standard-Branch als „stabilen“ Release-Branch zu behandeln. Das bedeutet, dass das Standardverhalten von `qwen extensions install <your-repo-uri>` auf dem stabilen Release-Branch liegt.

Angenommen, du möchtest drei Standard-Release-Kanäle pflegen: `stable`, `preview` und `dev`. Dann würdest du deine gesamte Standardentwicklung im `dev`-Branch durchführen. Wenn du bereit bist, eine Vorschauversion zu veröffentlichen, führst du diesen Branch in deinen `preview`-Branch zusammen. Wenn du deinen `preview`-Branch zur stabilen Version machen willst, führst du `preview` in deinen stabilen Branch ein (das könnte dein Standard-Branch oder ein anderer Branch sein).

Du kannst auch Änderungen von einem Branch in einen anderen mit `git cherry-pick` übernehmen. Beachte jedoch, dass dies dazu führt, dass die Historie deiner Branches leicht voneinander abweicht, es sei denn, du erzwingst beim Pushen von Änderungen bei jedem Release einen Rücksprung auf einen sauberen Zustand der Historie (was je nach Repository-Einstellungen möglicherweise nicht für den Standard-Branch möglich ist). Falls du Cherry-Picking planst, solltest du erwägen, deinen stabilen Branch nicht als Standard-Branch festzulegen, um das erzwungene Pushen zum Standard-Branch – was generell vermieden werden sollte – zu umgehen.

## Veröffentlichung über GitHub-Releases

Qwen Code-Erweiterungen können über [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) verteilt werden. Dies bietet eine schnellere und zuverlässigere Erstinstallations-Erfahrung für Benutzer, da das Klonen des Repositorys nicht erforderlich ist.

Jedes Release enthält mindestens eine Archivdatei, die den vollständigen Inhalt des Repos zum Zeitpunkt des verknüpften Tags enthält. Releases können auch [vorab erstellte Archive](#custom-pre-built-archives) enthalten, falls Ihre Erweiterung einen Build-Schritt benötigt oder plattformspezifische Binärdateien angehängt hat.

Beim Prüfen auf Updates sucht Qwen Code lediglich nach dem neuesten Release auf GitHub (Sie müssen es beim Erstellen des Releases entsprechend kennzeichnen), es sei denn, der Benutzer hat ein bestimmtes Release installiert, indem er `--ref=<some-release-tag>` angibt. Derzeit unterstützen wir keine Anmeldung für Vorab-Releases oder SemVer.

### Benutzerdefinierte vorgefertigte Archive

Benutzerdefinierte Archive müssen direkt als Assets an das GitHub-Release angehängt werden und müssen vollständig eigenständig sein. Das bedeutet, sie sollten die gesamte Erweiterung enthalten, siehe [Archivstruktur](#archive-structure).

Wenn Ihre Erweiterung plattformunabhängig ist, können Sie ein einzelnes generisches Asset bereitstellen. In diesem Fall sollte nur ein Asset an das Release angehängt sein.

Benutzerdefinierte Archive können auch verwendet werden, wenn Sie Ihre Erweiterung innerhalb eines größeren Repositorys entwickeln möchten. Sie können ein Archiv erstellen, das eine andere Struktur als das Repository selbst hat (z. B. könnte es einfach ein Archiv eines Unterverzeichnisses sein, das die Erweiterung enthält).

#### Plattformspezifische Archive

Um sicherzustellen, dass Qwen Code automatisch das richtige Release-Asset für jede Plattform finden kann, musst du dieser Namenskonvention folgen. Die CLI sucht in der folgenden Reihenfolge nach Assets:

1. **Plattform- und Architekturspezifisch:** `{platform}.{arch}.{name}.{extension}`
2. **Plattformspezifisch:** `{platform}.{name}.{extension}`
3. **Generisch:** Wenn nur ein Asset bereitgestellt wird, wird dieses als generischer Fallback verwendet.

- `{name}`: Der Name deiner Erweiterung.
- `{platform}`: Das Betriebssystem. Unterstützte Werte sind:
  - `darwin` (macOS)
  - `linux`
  - `win32` (Windows)
- `{arch}`: Die Architektur. Unterstützte Werte sind:
  - `x64`
  - `arm64`
- `{extension}`: Die Dateierweiterung des Archives (z. B. `.tar.gz` oder `.zip`).

**Beispiele:**

- `darwin.arm64.my-tool.tar.gz` (spezifisch für Apple Silicon Macs)
- `darwin.my-tool.tar.gz` (für alle Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archivstruktur

Archive müssen vollständig eigenständige Erweiterungen sein und alle Standardanforderungen erfüllen – insbesondere muss sich die Datei `qwen-extension.json` im Stammverzeichnis des Archivs befinden.

Das restliche Layout sollte genau wie bei einer typischen Erweiterung aussehen, siehe [extensions.md](extension.md).

#### Beispiel-GitHub Actions-Workflow

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

      - name: GitHub Release erstellen
        uses: softprops/action-gh-release@v1
        with:
          files: |
            release/darwin.arm64.my-tool.tar.gz
            release/linux.arm64.my-tool.tar.gz
            release/win32.arm64.my-tool.zip
```