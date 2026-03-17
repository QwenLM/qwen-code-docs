# Veröffentlichung von Erweiterungen

Es gibt zwei Hauptmethoden, um Erweiterungen für Benutzer bereitzustellen:

- [Git-Repository](#veröffentlichung-über-ein-git-repository)
- [GitHub-Releases](#veröffentlichung-über-github-releases)

Veröffentlichungen über ein Git-Repository sind in der Regel die einfachste und flexibelste Methode. GitHub-Releases können bei der ersten Installation effizienter sein, da sie als einzelne Archive ausgeliefert werden, anstatt einen `git clone`-Befehl auszuführen, der jede Datei einzeln herunterlädt. GitHub-Releases können zudem plattformspezifische Archive enthalten, falls Sie plattformspezifische Binärdateien bereitstellen müssen.

## Veröffentlichung über ein Git-Repository

Dies ist die flexibelste und einfachste Option. Sie müssen lediglich ein öffentlich zugängliches Git-Repository erstellen (z. B. ein öffentliches GitHub-Repository). Anschließend können Benutzer Ihre Erweiterung mit `qwen extensions install <Ihre-Repo-URI>` installieren; für GitHub-Repositories steht zudem das vereinfachte Format `qwen extensions install <Organisation>/<Repository>` zur Verfügung. Optional können Benutzer eine bestimmte Referenz (Branch, Tag oder Commit) mittels des Arguments `--ref=<eine-Referenz>` angeben; als Standard wird der Standard-Branch verwendet.

Wann immer Commits in die Referenz gepusht werden, von der ein Benutzer abhängt, wird dieser zur Aktualisierung der Erweiterung aufgefordert. Beachten Sie, dass dies auch einfache Rollbacks ermöglicht: Der HEAD-Commit gilt stets als die neueste Version – unabhängig von der tatsächlichen Version, die in der Datei `qwen-extension.json` angegeben ist.

### Verwalten von Release-Kanälen mithilfe eines Git-Repositorys

Benutzer können auf beliebige Referenzen („refs“) aus Ihrem Git-Repository zugreifen – etwa Branches oder Tags – und so mehrere Release-Kanäle verwalten.

Beispielsweise können Sie einen `stable`-Branch führen, den Benutzer wie folgt installieren können:  
`qwen extensions install <Ihre-Repo-URI> --ref=stable`.  
Alternativ können Sie diesen Branch als Standard festlegen, indem Sie Ihren Hauptbranch als stabilen Release-Branch verwenden und die Entwicklung in einem separaten Branch (z. B. `dev`) durchführen. Sie können beliebig viele Branches oder Tags anlegen und pflegen – dies bietet maximale Flexibilität für Sie und Ihre Benutzer.

Beachten Sie, dass diese `ref`-Argumente Tags, Branches oder sogar spezifische Commits sein können. Dadurch können Benutzer explizit auf eine bestimmte Version Ihrer Erweiterung verweisen. Wie Sie Ihre Tags und Branches organisieren, bleibt Ihnen überlassen.

### Beispiel für einen Veröffentlichungsprozess mit einem Git-Repository

Es gibt zahlreiche Möglichkeiten, wie Sie Veröffentlichungen mithilfe eines Git-Workflows verwalten können. Wir empfehlen jedoch, Ihren Standard-Branch als „stabilen“ Veröffentlichungs-Branch zu behandeln. Das bedeutet, dass das Standardverhalten von `qwen extensions install <Ihre-Repo-URI>` darin besteht, den stabilen Veröffentlichungs-Branch zu verwenden.

Angenommen, Sie möchten drei standardmäßige Veröffentlichungskanäle pflegen: `stable`, `preview` und `dev`. Alle regulären Entwicklungsarbeiten führen Sie im Branch `dev` durch. Sobald Sie eine Vorschauversion (Preview) bereitstellen möchten, führen Sie diesen Branch in Ihren `preview`-Branch zusammen. Wenn Sie Ihre Preview-Version schließlich als stabil freigeben möchten, führen Sie `preview` in Ihren `stable`-Branch zusammen (der entweder Ihr Standard-Branch oder ein separater Branch sein kann).

Sie können Änderungen auch gezielt mittels `git cherry-pick` von einem Branch in einen anderen übernehmen. Beachten Sie jedoch, dass dies dazu führt, dass sich die Historien Ihrer Branches leicht voneinander unterscheiden – es sei denn, Sie erzwingen bei jeder Veröffentlichung mittels `git push --force` die Aktualisierung der Branch-Historien, um wieder einen sauberen Zustand herzustellen (was je nach Repository-Einstellungen möglicherweise für den Standard-Branch nicht möglich ist). Falls Sie Cherry-Picks planen, sollten Sie erwägen, Ihren Standard-Branch *nicht* als stabilen Branch zu verwenden, um Force-Pushes auf den Standard-Branch zu vermeiden – diese sollten grundsätzlich vermieden werden.

## Veröffentlichung über GitHub-Releases

Qwen-Code-Erweiterungen können über [GitHub-Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases) verteilt werden. Dadurch ergibt sich für Nutzer eine schnellere und zuverlässigere erste Installations-Experience, da das Klonen des Repositorys entfällt.

Jede Veröffentlichung enthält mindestens eine Archivdatei mit dem vollständigen Inhalt des Repositorys zum Zeitpunkt des zugehörigen Tags. Optional können Releases auch [vorgefertigte Archive](#benutzerdefinierte-vorgefertigte-archive) enthalten, falls Ihre Erweiterung einen Build-Schritt erfordert oder plattformspezifische Binärdateien beinhaltet.

Beim Prüfen auf Updates sucht Qwen Code standardmäßig einfach nach der neuesten Veröffentlichung auf GitHub (Sie müssen diese beim Erstellen der Veröffentlichung entsprechend kennzeichnen), es sei denn, der Nutzer hat eine bestimmte Version explizit über `--ref=<ein-release-tag>` installiert. Derzeit unterstützen wir weder die explizite Auswahl von Pre-Release-Versionen noch SemVer.

### Benutzerdefinierte vorgefertigte Archive

Benutzerdefinierte Archive müssen direkt als Assets an die GitHub-Release angehängt werden und vollständig eigenständig sein. Das bedeutet, dass sie die gesamte Erweiterung enthalten müssen; siehe [Archivstruktur](#archive-structure).

Falls Ihre Erweiterung plattformunabhängig ist, können Sie ein einzelnes generisches Asset bereitstellen. In diesem Fall darf nur ein einziges Asset an die Release angehängt sein.

Benutzerdefinierte Archive können zudem verwendet werden, wenn Sie Ihre Erweiterung innerhalb eines größeren Repositorys entwickeln möchten. Sie können dann ein Archiv erstellen, dessen Struktur sich von der des Repositorys unterscheidet (beispielsweise könnte es lediglich ein Archiv eines Unterverzeichnisses sein, das die Erweiterung enthält).

#### Plattformspezifische Archive

Um sicherzustellen, dass Qwen Code automatisch das richtige Release-Artefakt für jede Plattform findet, müssen Sie diese Namenskonvention befolgen. Die CLI sucht die Artefakte in der folgenden Reihenfolge:

1.  **Plattform- und architekturspezifisch:** `{platform}.{arch}.{name}.{extension}`
2.  **Plattformspezifisch:** `{platform}.{name}.{extension}`
3.  **Generisch:** Falls nur ein Artefakt bereitgestellt wird, wird dieses als generischer Fallback verwendet.

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

- `darwin.arm64.my-tool.tar.gz` (speziell für Macs mit Apple Silicon)
- `darwin.my-tool.tar.gz` (für alle Macs)
- `linux.x64.my-tool.tar.gz`
- `win32.my-tool.zip`

#### Archivstruktur

Archive müssen vollständige Erweiterungen sein und alle Standardanforderungen erfüllen – insbesondere muss die Datei `qwen-extension.json` sich im Stammverzeichnis des Archivs befinden.

Der Rest der Verzeichnisstruktur muss exakt so aussehen wie bei einer typischen Erweiterung; siehe [extensions.md](extension.md).

#### Beispiel-Workflow für GitHub Actions

Hier ist ein Beispiel für einen GitHub Actions-Workflow, der eine Qwen Code-Erweiterung für mehrere Plattformen erstellt und veröffentlicht:

```yaml
name: Erweiterung veröffentlichen

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

      - name: Erweiterung erstellen
        run: npm run build

      - name: Veröffentlichungsartefakte erstellen
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