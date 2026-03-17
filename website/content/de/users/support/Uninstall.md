# Deinstallation

Ihre Deinstallationsmethode hängt davon ab, wie Sie die CLI ausgeführt haben. Befolgen Sie die Anweisungen für entweder `npx` oder eine globale npm-Installation.

## Methode 1: Verwendung von npx

`npx` führt Pakete aus einem temporären Cache ohne dauerhafte Installation aus. Um die CLI zu „deinstallieren“, müssen Sie diesen Cache leeren, wodurch `qwen-code` und alle anderen zuvor mit `npx` ausgeführten Pakete entfernt werden.

Der `npx`-Cache ist ein Verzeichnis namens `_npx` innerhalb Ihres Haupt-`npm`-Cache-Ordners. Den Pfad zu Ihrem `npm`-Cache ermitteln Sie durch Ausführen von `npm config get cache`.

**Für macOS / Linux**

```bash

# Der Pfad lautet in der Regel ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Für Windows**

_Eingabeaufforderung_

```cmd
:: Der Pfad lautet in der Regel %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# Der Pfad lautet in der Regel $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Methode 2: Verwenden von npm (globale Installation)

Falls Sie die CLI global installiert haben (z. B. `npm install -g @qwen-code/qwen-code`), verwenden Sie den Befehl `npm uninstall` mit dem Flag `-g`, um sie zu entfernen.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Dieser Befehl entfernt das Paket vollständig aus Ihrem System.