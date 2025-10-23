# Deinstallieren der CLI

Die Methode zur Deinstallation hängt davon ab, wie du die CLI ausgeführt hast. Folge den Anweisungen für entweder npx oder eine globale npm-Installation.

## Methode 1: Verwendung von npx

npx führt Pakete aus einem temporären Cache aus, ohne eine dauerhafte Installation vorzunehmen. Um die CLI zu „deinstallieren“, musst du diesen Cache leeren, wodurch qwen-code und alle anderen Pakete, die zuvor mit npx ausgeführt wurden, entfernt werden.

Der npx-Cache ist ein Verzeichnis namens `_npx` innerhalb deines Haupt-npm-Cache-Ordners. Du kannst deinen npm-Cache-Pfad herausfinden, indem du `npm config get cache` ausführst.

**Für macOS / Linux**

```bash

# Der Pfad ist in der Regel ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Für Windows**

_Command Prompt_

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

Wenn du die CLI global installiert hast (z.B. `npm install -g @qwen-code/qwen-code`), verwende den Befehl `npm uninstall` mit dem Flag `-g`, um sie zu entfernen.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Dieser Befehl entfernt das Package vollständig von deinem System.