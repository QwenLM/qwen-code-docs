# Désinstaller la CLI

La méthode de désinstallation dépend de la façon dont vous avez exécuté la CLI. Suivez les instructions correspondant à l'utilisation de `npx` ou d'une installation globale via `npm`.

## Méthode 1 : Utilisation de npx

`npx` exécute les packages depuis un cache temporaire sans installation permanente. Pour "désinstaller" la CLI, vous devez vider ce cache, ce qui supprimera `qwen-code` ainsi que tous les autres packages précédemment exécutés avec `npx`.

Le cache de `npx` est un répertoire nommé `_npx` situé dans le dossier principal du cache npm. Vous pouvez trouver le chemin de votre cache npm en exécutant la commande `npm config get cache`.

**Pour macOS / Linux**

```bash

# Le chemin est généralement ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Pour Windows**

_Command Prompt_

```cmd
:: Le chemin est généralement %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# Le chemin est généralement $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Méthode 2 : Utilisation de npm (Installation globale)

Si vous avez installé le CLI globalement (par exemple, `npm install -g @qwen-code/qwen-code`), utilisez la commande `npm uninstall` avec le flag `-g` pour le supprimer.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Cette commande supprime complètement le package de votre système.