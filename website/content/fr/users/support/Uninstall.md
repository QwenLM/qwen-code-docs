# Désinstaller

Votre méthode de désinstallation dépend de la façon dont vous avez exécuté la CLI. Suivez les instructions correspondant soit à npx, soit à une installation globale via npm.

## Méthode 1 : Utilisation de npx

npx exécute les paquets depuis un cache temporaire sans installation permanente. Pour « désinstaller » la CLI, vous devez vider ce cache, ce qui supprimera qwen-code ainsi que tous les autres paquets précédemment exécutés avec npx.

Le cache de npx est un répertoire nommé `_npx` situé dans le dossier principal du cache npm. Vous pouvez trouver le chemin de votre cache npm en exécutant `npm config get cache`.

**Pour macOS / Linux**

```bash

# Le chemin est généralement ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Pour Windows**

Invite de commandes

```cmd
:: Le chemin est généralement %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

PowerShell

```powershell

# Le chemin est généralement $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Méthode 2 : Utilisation de npm (Installation globale)

Si vous avez installé la CLI de manière globale (par exemple `npm install -g @qwen-code/qwen-code`), utilisez la commande `npm uninstall` avec le drapeau `-g` pour la supprimer.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Cette commande supprime complètement le paquet de votre système.