# Désinstallation

Votre méthode de désinstallation dépend de la façon dont vous avez exécuté l’interface en ligne de commande (CLI). Suivez les instructions correspondant à l’utilisation de `npx` ou à une installation globale via `npm`.

## Méthode 1 : Utilisation de npx

`npx` exécute des packages à partir d’un cache temporaire, sans installation permanente. Pour « désinstaller » la CLI, vous devez vider ce cache, ce qui supprimera `qwen-code` ainsi que tous les autres packages précédemment exécutés avec `npx`.

Le cache `npx` est un répertoire nommé `_npx`, situé dans le dossier principal du cache `npm`. Vous pouvez obtenir le chemin de ce cache en exécutant la commande `npm config get cache`.

**Sur macOS / Linux**

```bash

# Le chemin est généralement ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Sur Windows**

_Prompt de commandes_

```cmd
:: Le chemin est généralement %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# Le chemin est généralement $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Méthode 2 : Utilisation de npm (installation globale)

Si vous avez installé l’interface CLI de façon globale (par exemple avec `npm install -g @qwen-code/qwen-code`), utilisez la commande `npm uninstall` avec l’option `-g` pour la désinstaller.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Cette commande supprime complètement le package de votre système.