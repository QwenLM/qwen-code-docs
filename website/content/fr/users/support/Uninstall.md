# Désinstallation

La méthode de désinstallation dépend de la façon dont vous avez exécuté la CLI. Suivez les instructions correspondant à l'utilisation de npx ou à une installation globale via npm.

## Méthode 1 : Utilisation de npx

npx exécute les packages depuis un cache temporaire sans installation permanente. Pour « désinstaller » la CLI, vous devez vider ce cache, ce qui supprimera qwen-code ainsi que tous les autres packages précédemment exécutés avec npx.

Le cache npx est un répertoire nommé `_npx` situé dans votre dossier de cache npm principal. Vous pouvez obtenir le chemin de votre cache npm en exécutant `npm config get cache`.

**Pour macOS / Linux**

```bash
# Le chemin est généralement ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Pour Windows**

_Invite de commandes_

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

Si vous avez installé la CLI globalement (par ex. `npm install -g @qwen-code/qwen-code`), utilisez la commande `npm uninstall` avec l'option `-g` pour la supprimer.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Cette commande supprime complètement le package de votre système.