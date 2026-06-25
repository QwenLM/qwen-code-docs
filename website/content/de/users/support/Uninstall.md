# Deinstallation

Ihre Deinstallationsmethode hängt davon ab, wie Sie die CLI installiert haben.

## Methode 1: Mit npx

npx führt Pakete aus einem temporären Cache aus, ohne dauerhafte Installation. Um die CLI zu „deinstallieren“, müssen Sie diesen Cache leeren. Dadurch werden qwen-code und alle anderen Pakete entfernt, die zuvor mit npx ausgeführt wurden.

Der npx-Cache ist ein Verzeichnis namens `_npx` in Ihrem Haupt-npm-Cache-Ordner. Sie finden den npm-Cache-Pfad, indem Sie `npm config get cache` ausführen.

**Für macOS / Linux**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Für Windows**

_Eingabeaufforderung_

```cmd
:: The path is typically %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# The path is typically $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Methode 2: Mit npm (Globale Installation)

Wenn Sie die CLI global installiert haben (z. B. `npm install -g @qwen-code/qwen-code`), verwenden Sie den Befehl `npm uninstall` mit der Option `-g`, um sie zu entfernen.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Dieser Befehl entfernt das Paket vollständig von Ihrem System.

## Methode 3: Eigenständige Installation

Wenn Sie über das eigenständige Installationsprogramm installiert haben (`curl ... | bash` oder `irm ... | iex`), verwenden Sie das dedizierte Deinstallationsskript.

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

Das Deinstallationsprogramm entfernt die eigenständige Laufzeit, den generierten `qwen`-Wrapper und die vom Installationsprogramm verwalteten PATH-Änderungen. Ihre Qwen Code-Konfiguration (`~/.qwen`) bleibt standardmäßig erhalten.
