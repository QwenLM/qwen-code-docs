# Deinstallation

Die Deinstallationsmethode hängt davon ab, wie Sie die CLI installiert haben.

## Methode 1: Verwendung von npx

npx führt Pakete aus einem temporären Cache aus, ohne eine dauerhafte Installation. Um die CLI zu „deinstallieren“, müssen Sie diesen Cache leeren, wodurch qwen-code und alle anderen zuvor mit npx ausgeführten Pakete entfernt werden.

Der npx-Cache ist ein Verzeichnis namens `_npx` in Ihrem Haupt-npm-Cache-Ordner. Sie können den Pfad zu Ihrem npm-Cache finden, indem Sie `npm config get cache` ausführen.

**Für macOS / Linux**

```bash
# Der Pfad ist in der Regel ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Für Windows**

_Eingabeaufforderung_

```cmd
:: Der Pfad ist in der Regel %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# Der Pfad ist in der Regel $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Methode 2: Verwendung von npm (Globale Installation)

Wenn Sie die CLI global installiert haben (z. B. `npm install -g @qwen-code/qwen-code`), verwenden Sie den Befehl `npm uninstall` mit der Option `-g`, um sie zu entfernen.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Dieser Befehl entfernt das Paket vollständig von Ihrem System.

## Methode 3: Eigenständige Installation

Wenn Sie über das eigenständige Installationsprogramm (`curl ... | bash` oder `irm ... | iex`) installiert haben, verwenden Sie das dafür vorgesehene Deinstallationsskript.

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

Das Deinstallationsprogramm entfernt die eigenständige Laufzeitumgebung, den generierten `qwen`-Wrapper und die vom Installationsprogramm verwalteten PATH-Änderungen. Ihre Qwen Code-Konfiguration (`~/.qwen`) bleibt standardmäßig erhalten.