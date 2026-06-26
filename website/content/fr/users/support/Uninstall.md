# Désinstallation

La méthode de désinstallation dépend de la façon dont vous avez installé la CLI.

## Méthode 1 : Utilisation de npx

npx exécute les packages depuis un cache temporaire sans installation permanente. Pour « désinstaller » la CLI, vous devez vider ce cache, ce qui supprimera `qwen-code` ainsi que tous les autres packages exécutés précédemment avec npx.

Le cache de npx est un répertoire nommé `_npx` situé dans le dossier principal de votre cache npm. Vous pouvez trouver le chemin de votre cache npm en exécutant `npm config get cache`.

**Pour macOS / Linux**

```bash
# The path is typically ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**Pour Windows**

_Invite de commandes_

```cmd
:: The path is typically %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell
# The path is typically $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## Méthode 2 : Utilisation de npm (installation globale)

Si vous avez installé la CLI globalement (par exemple `npm install -g @qwen-code/qwen-code`), utilisez la commande `npm uninstall` avec l'option `-g` pour la supprimer.

```bash
npm uninstall -g @qwen-code/qwen-code
```

Cette commande supprime complètement le package de votre système.

## Méthode 3 : Installation autonome

Si vous avez installé via le programme d'installation autonome (`curl ... | bash` ou `irm ... | iex`), utilisez le script de désinstallation dédié.

**Linux / macOS**

```bash
curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.sh | bash
```

**Windows**

```powershell
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/uninstall-qwen-standalone.ps1 | iex
```

Le désinstalleur supprime l'environnement d'exécution autonome, le wrapper `qwen` généré, et les modifications de PATH gérées par l'installateur. Votre configuration Qwen Code (`~/.qwen`) est conservée par défaut.
