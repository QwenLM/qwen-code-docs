# 卸载 CLI

你的卸载方法取决于你运行 CLI 的方式。请根据你使用 npx 或全局 npm 安装的情况，按照相应的说明操作。

## 方法 1: 使用 npx

npx 从临时缓存中运行包，而不会进行永久安装。要"卸载"CLI，你必须清除这个缓存，这将移除 gemini-cli 以及任何其他之前使用 npx 执行过的包。

npx 缓存是你的主 npm 缓存文件夹内一个名为 `_npx` 的目录。你可以通过运行 `npm config get cache` 来找到你的 npm 缓存路径。

**对于 macOS / Linux**

```bash

# 路径通常为 ~/.npm/_npx
rm -rf "$(npm config get cache)/_npx"
```

**对于 Windows**

_Command Prompt_

```cmd
:: 路径通常为 %LocalAppData%\npm-cache\_npx
rmdir /s /q "%LocalAppData%\npm-cache\_npx"
```

_PowerShell_

```powershell

# 路径通常为 $env:LocalAppData\npm-cache\_npx
Remove-Item -Path (Join-Path $env:LocalAppData "npm-cache\_npx") -Recurse -Force
```

## 方法 2：使用 npm（全局安装）

如果你是全局安装的 CLI（例如，`npm install -g @qwen-code/qwen-code`），那么可以使用 `npm uninstall` 命令加上 `-g` 参数来卸载它。

```bash
npm uninstall -g @qwen-code/qwen-code
```

这条命令会从你的系统中完全移除该 package。